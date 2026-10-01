/**
 * 服务端多 Agent 编排器。
 * - 每个步骤产生真实的运行事件（同时写库与推送到 UI 流）
 * - 每步边界做心跳并检查取消
 * - 运行与 HTTP 流解耦：客户端断开不等于停止
 */
import { streamText, NoObjectGeneratedError } from "ai";
import type { AnalysisRun, Conversation, Message } from "@/generated/prisma/client";
import { BinanceError } from "@/lib/binance/client";
import { requireSymbol } from "@/lib/binance/symbols";
import { getDb } from "@/lib/db";
import { toPlainString } from "@/lib/decimal";
import { agentSettings } from "@/lib/agent/settings";
import { AgentError, isAbortError } from "@/lib/agent/errors";
import type { RunEvent } from "@/lib/agent/events";
import { applyEvent, composeAssistantParts, createAssistantState, type AssistantState } from "@/lib/agent/compose-parts";
import { applyIntent, FULL_PIPELINE_KINDS, ruleIntent } from "@/lib/agent/intents";
import * as db from "@/lib/agent/persistence";
import { Budget, generateStructured, getModel, getModelInfo, isModelConfigured, outputTokens, providerOptions } from "@/lib/agent/provider";
import { PROMPT_VERSION, SYSTEM } from "@/lib/agent/prompts";
import { publish, registerRun, type RunHandle } from "@/lib/agent/run-registry";
import {
  intentOutputSchema,
  regimeAgentOutputSchema,
  researchOutputSchema,
  riskOutputSchema,
  scenariosOutputSchema,
  synthesisOutputSchema,
  technicalAnalystOutputSchema,
  UNSUPPORTED_DATA_SOURCES,
  type AgentMetadata,
  type AnalysisReport,
  type Evidence,
  type RunConfig,
  type RunError,
  type RunKind,
  type StepData,
  type ToolData,
} from "@/lib/agent/schemas";
import { pipelineFor, STEP, type StepDef } from "@/lib/agent/steps/definitions";
import { buildFacts, compactReport } from "@/lib/agent/steps/facts";
import { computeFeatures, predictionEvidence, targetRangeEvidence, targetRangeRelation, type Features } from "@/lib/agent/steps/features";
import { filterEvidenceIds, knownEvidenceIds, normalizeStance, resolveScenarios, validateReport } from "@/lib/agent/steps/validate";
import { takeSnapshot, type Snapshot } from "@/lib/market/snapshot";
import { predict } from "@/lib/quant/prediction";
import type { SymbolInfo } from "@/lib/types";
import type { z } from "zod";


export interface StartRunInput {
  run: AnalysisRun;
  userMessage: Message;
  assistantMessage: Message;
  conversation: Conversation;
  question: string;
  config: RunConfig;
}

interface StepOutcome {
  summary: string;
  result?: unknown;
  evidenceIds?: string[];
}

class RunCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "AbortError";
  }
}

class Runtime {
  readonly handle: RunHandle;
  readonly state: AssistantState = createAssistantState();
  readonly budget: Budget;
  readonly startedAt = new Date();
  kind: RunKind;
  config: RunConfig;
  reportId: string | null = null;
  private lastPartsSave = 0;
  private order = 0;
  private pendingEmitted = new Set<string>();

  constructor(
    readonly input: StartRunInput,
    handle: RunHandle,
  ) {
    this.handle = handle;
    this.kind = input.run.kind;
    this.config = input.config;
    this.budget = new Budget(agentSettings().maxModelCalls, Date.now() + agentSettings().maxRunMs);
  }

  get signal(): AbortSignal {
    return this.handle.controller.signal;
  }
  get runId(): string {
    return this.input.run.id;
  }

  metadata(status?: AgentMetadata["status"]): AgentMetadata {
    return { runId: this.runId, kind: this.kind, createdAt: this.input.assistantMessage.createdAt.toISOString(), finishedAt: status && status !== "running" ? new Date().toISOString() : null, status };
  }

  runData(status: "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled", error: RunError | null = null) {
    return {
      runId: this.runId,
      status,
      kind: this.kind,
      symbol: this.config.symbol,
      intervals: this.config.intervals,
      horizon: this.config.horizon,
      attempt: this.input.run.attempt,
      startedAt: this.startedAt.toISOString(),
      finishedAt: status === "completed" || status === "failed" || status === "cancelled" ? new Date().toISOString() : null,
      error,
    };
  }

  /** 发出事件：更新内存状态、推送订阅者、写库 */
  async emit(ev: RunEvent): Promise<void> {
    applyEvent(this.state, ev);
    publish(this.handle, ev);
    try {
      if (ev.type === "step") await db.upsertStep(this.runId, ev.data);
      else if (ev.type === "snapshot") await db.saveSnapshot(this.runId, ev.data);
      else if (ev.type === "report") this.reportId = await db.saveReport(this.runId, this.input.conversation.id, ev.data);
      const isText = ev.type === "text-delta";
      const now = Date.now();
      if (!isText || now - this.lastPartsSave > 500) {
        this.lastPartsSave = now;
        await db.saveAssistantParts(this.input.assistantMessage.id, composeAssistantParts(this.state), this.metadata("running"));
      }
    } catch (err) {
      console.error("[agent] 持久化事件失败:", err instanceof Error ? err.message : err);
    }
  }

  async emitPending(defs: StepDef[]): Promise<void> {
    for (const d of defs) {
      if (this.pendingEmitted.has(d.id)) continue;
      this.pendingEmitted.add(d.id);
      await this.emit({ type: "step", data: this.stepData(d, "pending") });
    }
  }

  private stepData(def: StepDef, status: StepData["status"], patch: Partial<StepData> = {}): StepData {
    const existing = this.state.steps.get(def.id);
    return {
      stepId: def.id,
      order: existing?.order ?? this.order++,
      name: def.name,
      status,
      startedAt: existing?.startedAt ?? null,
      finishedAt: null,
      durationMs: null,
      summary: existing?.summary ?? null,
      error: null,
      evidenceIds: existing?.evidenceIds ?? [],
      ...patch,
    };
  }

  /** 每步边界：心跳 + 取消检查 */
  async checkpoint(): Promise<void> {
    this.signal.throwIfAborted();
    const status = await db.heartbeat(this.runId);
    if (status === "cancelling" || status === "cancelled") {
      if (!this.signal.aborted) this.handle.controller.abort(new RunCancelled());
      throw new RunCancelled();
    }
    if (status === "failed") {
      throw new AgentError(409, "conflict", "运行已被其他进程标记为失败", { code: "orphaned" });
    }
    if (this.budget.remainingMs <= 0) {
      throw new AgentError(504, "timeout", "分析运行超过总时限，已停止", { code: "budget_exceeded" });
    }
  }

  async step<T extends StepOutcome>(def: StepDef, fn: () => Promise<T>): Promise<T> {
    await this.checkpoint();
    const startedAt = new Date();
    await this.emit({ type: "step", data: this.stepData(def, "running", { startedAt: startedAt.toISOString() }) });
    try {
      const out = await fn();
      const finishedAt = new Date();
      await this.emit({
        type: "step",
        data: this.stepData(def, "completed", {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          summary: out.summary,
          evidenceIds: out.evidenceIds ?? [],
        }),
      });
      if (out.result !== undefined) await db.upsertStep(this.runId, this.state.steps.get(def.id) as StepData, out.result);
      return out;
    } catch (err) {
      const finishedAt = new Date();
      const cancelled = isAbortError(err) || (this.signal.aborted && !(this.signal.reason instanceof AgentError));
      await this.emit({
        type: "step",
        data: this.stepData(def, cancelled ? "cancelled" : "failed", {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          error: cancelled ? null : toRunError(err, def.id),
        }),
      });
      throw err;
    }
  }

  async skip(def: StepDef, reason: string): Promise<void> {
    await this.emit({ type: "step", data: this.stepData(def, "skipped", { summary: reason, finishedAt: new Date().toISOString() }) });
  }

  toolStart(toolId: string, name: string, input: unknown): ToolData {
    const t: ToolData = { toolId, name, status: "running", input, error: null, startedAt: new Date().toISOString(), finishedAt: null, durationMs: null };
    void this.emit({ type: "tool", data: t });
    return t;
  }

  async toolEnd(t: ToolData, output: unknown, error: string | null = null): Promise<void> {
    const finishedAt = new Date();
    await this.emit({
      type: "tool",
      data: { ...t, status: error ? "failed" : "completed", output, error, finishedAt: finishedAt.toISOString(), durationMs: finishedAt.getTime() - new Date(t.startedAt).getTime() },
    });
  }

  async structured<S extends z.ZodType>(role: "analyst" | "synth", name: string, schema: S, system: string, prompt: string, maxOutputTokens?: number): Promise<z.infer<S>> {
    return generateStructured({ role, schema, name, system, prompt, signal: this.signal, budget: this.budget, maxOutputTokens });
  }

  /** 流式叙述文本 */
  async narrate(system: string, prompt: string, textId: string, maxOutputTokens = 2_400): Promise<string> {
    this.budget.consume();
    const result = streamText({
      model: getModel("synth"),
      system,
      prompt,
      abortSignal: this.signal,
      maxOutputTokens: outputTokens(maxOutputTokens),
      temperature: 0.3,
      maxRetries: 1,
      providerOptions: providerOptions(),
    });
    await this.emit({ type: "text-start", id: textId });
    let full = "";
    try {
      for await (const delta of result.textStream) {
        full += delta;
        await this.emit({ type: "text-delta", id: textId, delta });
      }
    } finally {
      await this.emit({ type: "text-end", id: textId });
    }
    if (!full.trim()) throw new AgentError(502, "bad_request", "模型未返回任何文本", { code: "empty_output" });
    return full;
  }
}

/* ---------------------------------- 错误映射 ---------------------------------- */

export function toRunError(err: unknown, stepId?: string): RunError {
  if (err instanceof BinanceError) {
    return { code: `binance_${err.kind}`, message: err.message, stepId, retryable: err.kind !== "not_found" && err.kind !== "bad_request" };
  }
  if (err instanceof AgentError) {
    const code = typeof err.details?.code === "string" ? err.details.code : err.kind;
    return { code, message: err.message, stepId, retryable: err.kind !== "not_found" && err.kind !== "validation", cause: typeof err.details?.cause === "string" ? err.details.cause : undefined };
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    return { code: "structured_output_invalid", message: "模型输出未通过结构化校验", stepId, retryable: true };
  }
  if (err instanceof Error) {
    if (/DATABASE_URL|ECONNREFUSED|prisma/i.test(err.message)) return { code: "database", message: "数据库不可用", stepId, retryable: true };
    if (err.name === "TimeoutError") return { code: "model_timeout", message: "模型请求超时", stepId, retryable: true };
    return { code: "internal", message: err.message.slice(0, 300), stepId, retryable: true };
  }
  return { code: "internal", message: "未知错误", stepId, retryable: true };
}

/* ---------------------------------- 入口 ---------------------------------- */

export function startRun(input: StartRunInput): { handle: RunHandle; promise: Promise<void> } {
  const handle = registerRun(input.run.id);
  const rt = new Runtime(input, handle);
  const promise = execute(rt).catch((err) => {
    console.error("[agent] 运行异常终止:", err instanceof Error ? err.message : err);
  });
  return { handle, promise };
}

async function execute(rt: Runtime): Promise<void> {
  const started = await db.markRunRunning(rt.runId, { kind: rt.kind, config: rt.config, model: getModelInfoSafe() });
  if (!started) {
    // 已被取消或回收
    await rt.emit({ type: "run", data: rt.runData("cancelled") });
    publish(rt.handle, { type: "done", outcome: "cancelled" });
    return;
  }
  await rt.emit({ type: "run", data: rt.runData("running") });
  const timeout = setTimeout(() => rt.handle.controller.abort(new AgentError(504, "timeout", "分析运行超过总时限，已停止", { code: "budget_exceeded" })), agentSettings().maxRunMs);

  try {
    if (rt.kind === "undetermined") await routeIntent(rt);
    const pipeline = pipelineFor(rt.kind);
    await rt.emitPending(pipeline);
    if (FULL_PIPELINE_KINDS.includes(rt.kind)) await runFullPipeline(rt);
    else if (rt.kind === "clarify") await runClarify(rt);
    else await runFollowup(rt);
    await finish(rt, "completed", null);
  } catch (err) {
    const timedOut = rt.signal.aborted && rt.signal.reason instanceof AgentError;
    if ((isAbortError(err) || rt.signal.aborted) && !timedOut) {
      await finish(rt, "cancelled", null);
    } else {
      const error = timedOut ? toRunError(rt.signal.reason) : toRunError(err);
      await rt.emit({ type: "error", data: error });
      await finish(rt, "failed", error);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function getModelInfoSafe() {
  try {
    return getModelInfo();
  } catch {
    return null;
  }
}

async function finish(rt: Runtime, terminal: "completed" | "failed" | "cancelled", error: RunError | null): Promise<void> {
  await rt.emit({ type: "run", data: rt.runData(terminal, error) });
  const parts = composeAssistantParts(rt.state);
  const status = terminal === "completed" ? "complete" : terminal;
  const patch =
    terminal === "completed" && rt.reportId && rt.config.symbol
      ? { reportId: rt.reportId, symbol: rt.config.symbol, intervals: rt.config.intervals, horizon: rt.config.horizon }
      : null;
  try {
    await db.finalizeRun({ runId: rt.runId, terminal, error, parts, metadata: rt.metadata(status), conversationPatch: patch });
  } catch (err) {
    console.error("[agent] finalizeRun 失败:", err instanceof Error ? err.message : err);
  }
  publish(rt.handle, { type: "done", outcome: terminal });
}

/* ---------------------------------- 意图路由 ---------------------------------- */

async function routeIntent(rt: Runtime): Promise<void> {
  await rt.emitPending([STEP.route_intent]);
  await rt.step(STEP.route_intent, async () => {
    const conv = rt.input.conversation;
    const ctx = { currentSymbol: conv.currentSymbol, currentHorizon: rt.config.horizon, hasReport: Boolean(conv.currentReportId) };
    let intent = ruleIntent(rt.input.question, ctx);
    let via = "rule";
    if (!intent.confident && isModelConfigured()) {
      via = "model";
      const history = await db.loadRecentTextHistory(conv.id, rt.input.userMessage.ordinal, 6);
      const out = await rt.structured(
        "analyst",
        "intent",
        intentOutputSchema,
        SYSTEM.intent,
        JSON.stringify({ currentSymbol: conv.currentSymbol, currentHorizon: rt.config.horizon, hasReport: ctx.hasReport, history, latest: rt.input.question }),
        400,
      );
      intent = {
        kind: out.kind,
        symbol: out.symbol ? (out.symbol.toUpperCase().endsWith("USDT") ? out.symbol.toUpperCase() : `${out.symbol.toUpperCase()}USDT`) : intent.symbol,
        horizon: out.horizon ?? intent.horizon,
        hypothesis: out.hypothesis ?? intent.hypothesis,
        confident: true,
      };
    }
    const kind = intent.kind ?? "clarify";
    rt.kind = kind;
    rt.config = applyIntent(rt.config, { kind, symbol: intent.symbol, horizon: intent.horizon, hypothesis: intent.hypothesis }, conv.currentReportId);
    await db.updateRunConfig(rt.runId, { kind, config: rt.config });
    await rt.emit({ type: "run", data: rt.runData("running") });
    return { summary: `意图：${kind}（${via}）${rt.config.symbol ? ` · ${rt.config.symbol}` : ""} · ${rt.config.horizon}`, result: { kind, via, config: rt.config } };
  });
}

/* ---------------------------------- 完整流程 ---------------------------------- */

interface FullContext {
  info: SymbolInfo;
  snapshot: Snapshot;
  features: Features;
  evidence: Evidence[];
  prediction: ReturnType<typeof predict>;
  targetRelation: ReturnType<typeof targetRangeRelation>;
  technical: z.infer<typeof technicalAnalystOutputSchema> | null;
  regimeView: z.infer<typeof regimeAgentOutputSchema> | null;
  bull: z.infer<typeof researchOutputSchema> | null;
  bear: z.infer<typeof researchOutputSchema> | null;
  synthesis: z.infer<typeof synthesisOutputSchema> | null;
  scenarios: z.infer<typeof scenariosOutputSchema> | null;
  risk: z.infer<typeof riskOutputSchema> | null;
}

async function runFullPipeline(rt: Runtime): Promise<void> {
  const ctx = {} as FullContext;

  await rt.step(STEP.resolve_symbol, async () => {
    if (!rt.config.symbol) throw new AgentError(400, "validation", "未指定交易对", { code: "missing_symbol" });
    ctx.info = await requireSymbol(rt.config.symbol);
    // 目标区间只读数据库中已保存的值
    const fav = await getDb().favorite.findUnique({ where: { symbol: ctx.info.symbol } });
    const range = fav?.targetLow != null && fav.targetHigh != null ? { low: toPlainString(fav.targetLow.toFixed()), high: toPlainString(fav.targetHigh.toFixed()) } : null;
    rt.config = { ...rt.config, symbol: ctx.info.symbol, targetRange: rt.kind === "switch_symbol" ? range : rt.config.targetRange ?? range };
    await db.updateRunConfig(rt.runId, { config: rt.config });
    await rt.emit({ type: "run", data: rt.runData("running") });
    return { summary: `${ctx.info.symbol}（${ctx.info.baseAsset}/${ctx.info.quoteAsset}）${rt.config.targetRange ? ` · 目标区间 ${rt.config.targetRange.low}–${rt.config.targetRange.high}` : ""}`, result: { info: ctx.info, targetRange: rt.config.targetRange } };
  });

  await rt.step(STEP.fetch_data, async () => {
    const tool = rt.toolStart("binance_klines", "获取已收盘 K 线", { symbol: ctx.info.symbol, intervals: rt.config.intervals, cutoff: new Date().toISOString() });
    try {
      ctx.snapshot = await takeSnapshot(ctx.info.symbol, rt.config.intervals, { signal: rt.signal });
    } catch (err) {
      await rt.toolEnd(tool, null, err instanceof Error ? err.message : String(err));
      throw err;
    }
    await rt.toolEnd(tool, { snapshot: ctx.snapshot.meta, quality: ctx.snapshot.quality });
    await rt.emit({ type: "snapshot", data: ctx.snapshot.meta });
    const counts = ctx.snapshot.meta.intervals.map((i) => `${i.interval}×${i.count}`).join("，");
    return { summary: `快照 ${ctx.snapshot.meta.snapshotId.slice(0, 8)} · ${counts} · 截止 ${ctx.snapshot.meta.dataCutoff}`, result: ctx.snapshot.meta };
  });

  await rt.step(STEP.quality_check, async () => {
    const q = ctx.snapshot.quality;
    if (!q.ok) {
      throw new AgentError(422, "validation", `行情数据不满足分析要求：${q.warnings.join("；")}`, { code: "data_quality" });
    }
    if (q.warnings.length) await rt.emit({ type: "notice", data: { level: "warning", code: "data_quality", message: q.warnings.join("；") } });
    return { summary: q.warnings.length ? `通过，${q.warnings.length} 条提示` : "通过", result: q };
  });

  await rt.step(STEP.features, async () => {
    const tool = rt.toolStart("quant_features", "计算技术指标与支撑阻力", { intervals: rt.config.intervals, indicators: ["EMA20/50/200", "RSI14", "MACD(12,26,9)", "ATR14", "BB(20,2)", "returns", "realizedVol20", "volumeChange20"], levels: "swing+cluster" });
    try {
      ctx.features = computeFeatures(ctx.snapshot, rt.config.intervals);
    } catch (err) {
      await rt.toolEnd(tool, null, err instanceof Error ? err.message : String(err));
      throw err;
    }
    ctx.targetRelation = targetRangeRelation(rt.config.targetRange, ctx.features.referencePrice);
    ctx.evidence = [...ctx.features.evidence];
    const tev = targetRangeEvidence(rt.config.targetRange, ctx.targetRelation);
    if (tev) ctx.evidence.push(tev);
    await rt.toolEnd(tool, { indicators: ctx.features.indicators, levels: ctx.features.levels, regime: ctx.features.regime.label, alignment: ctx.features.alignment, referencePrice: ctx.features.referencePrice });
    return {
      summary: `状态 ${ctx.features.regime.label} · 支撑 ${ctx.features.levels.support.length} / 阻力 ${ctx.features.levels.resistance.length} · 一致性 ${ctx.features.alignment.score.toFixed(2)}`,
      result: { regime: ctx.features.regime, alignment: ctx.features.alignment, levels: ctx.features.levels },
      evidenceIds: ctx.evidence.map((e) => e.id),
    };
  });

  await rt.step(STEP.prediction, async () => {
    ctx.prediction = predict({ symbol: ctx.info.symbol, horizon: rt.config.horizon, snapshotId: ctx.snapshot.meta.snapshotId });
    ctx.evidence.push(predictionEvidence(ctx.prediction));
    if (ctx.prediction.status !== "ok") {
      await rt.emit({ type: "notice", data: { level: "info", code: "prediction_unavailable", message: "量化预测不可用，本次仅技术分析" } });
    }
    return { summary: ctx.prediction.status === "ok" ? `模型 ${ctx.prediction.modelVersion}` : "预测不可用 · 仅技术分析", result: ctx.prediction, evidenceIds: ["ev:prediction"] };
  });

  const facts = () =>
    buildFacts({
      symbol: ctx.info.symbol,
      dataCutoff: ctx.snapshot.meta.dataCutoff,
      horizon: rt.config.horizon,
      referencePrice: ctx.features.referencePrice,
      quality: ctx.snapshot.quality,
      regime: ctx.features.regime,
      alignment: ctx.features.alignment,
      indicators: ctx.features.indicators,
      levels: ctx.features.levels,
      prediction: ctx.prediction,
      targetRange: rt.config.targetRange,
      targetRelation: ctx.targetRelation,
      evidence: ctx.evidence,
      unsupported: UNSUPPORTED_DATA_SOURCES,
    });
  const known = () => knownEvidenceIds(ctx.evidence);

  await rt.step(STEP.technical_analyst, async () => {
    const out = await rt.structured("analyst", "technical_analysis", technicalAnalystOutputSchema, SYSTEM.technical, `事实与证据：\n${facts()}\n\n请给出技术分析。`);
    ctx.technical = { ...out, evidenceIds: filterEvidenceIds(out.evidenceIds, known()) };
    return { summary: out.summary.slice(0, 120), result: ctx.technical, evidenceIds: ctx.technical.evidenceIds };
  });

  await rt.step(STEP.market_regime, async () => {
    const out = await rt.structured("analyst", "market_regime", regimeAgentOutputSchema, SYSTEM.regime, `事实与证据：\n${facts()}\n\n技术分析师结论：${JSON.stringify(ctx.technical)}\n\n请判断市场状态。`);
    ctx.regimeView = { ...out, evidenceIds: filterEvidenceIds(out.evidenceIds, known()) };
    return { summary: `${out.label} · ${out.summary.slice(0, 100)}`, result: ctx.regimeView, evidenceIds: ctx.regimeView.evidenceIds };
  });

  const rounds = agentSettings().debateRounds;
  await rt.step(STEP.bull_research, async () => {
    const out = await rt.structured("analyst", "bull_research", researchOutputSchema, SYSTEM.bull, `事实与证据：\n${facts()}\n\n技术分析：${JSON.stringify(ctx.technical)}\n市场状态：${JSON.stringify(ctx.regimeView)}\n\n请给出多头研究。`);
    ctx.bull = { ...out, evidenceIds: filterEvidenceIds(out.evidenceIds, known()) };
    return { summary: `${out.evidence.length} 条证据 · ${out.invalidation.length} 条失效条件`, result: ctx.bull, evidenceIds: ctx.bull.evidenceIds };
  });

  await rt.step(STEP.bear_research, async () => {
    let out = await rt.structured("analyst", "bear_research", researchOutputSchema, SYSTEM.bear, `事实与证据：\n${facts()}\n\n技术分析：${JSON.stringify(ctx.technical)}\n市场状态：${JSON.stringify(ctx.regimeView)}\n多头观点：${JSON.stringify(ctx.bull)}\n\n请给出空头研究并反驳多头。`);
    ctx.bear = { ...out, evidenceIds: filterEvidenceIds(out.evidenceIds, known()) };
    for (let r = 1; r < rounds; r++) {
      const rebut = await rt.structured("analyst", "bull_rebuttal", researchOutputSchema, SYSTEM.bull, `事实与证据：\n${facts()}\n\n空头观点：${JSON.stringify(ctx.bear)}\n你之前的多头观点：${JSON.stringify(ctx.bull)}\n\n请回应空头并修订多头观点。`);
      ctx.bull = { ...rebut, evidenceIds: filterEvidenceIds(rebut.evidenceIds, known()) };
      out = await rt.structured("analyst", "bear_rebuttal", researchOutputSchema, SYSTEM.bear, `事实与证据：\n${facts()}\n\n修订后的多头观点：${JSON.stringify(ctx.bull)}\n\n请回应并修订空头观点。`);
      ctx.bear = { ...out, evidenceIds: filterEvidenceIds(out.evidenceIds, known()) };
    }
    return { summary: `${ctx.bear.evidence.length} 条证据 · ${rounds} 轮辩论`, result: ctx.bear, evidenceIds: ctx.bear.evidenceIds };
  });

  await rt.step(STEP.research_synthesis, async () => {
    const out = await rt.structured("synth", "research_synthesis", synthesisOutputSchema, SYSTEM.synthesis, `事实与证据：\n${facts()}\n\n多头：${JSON.stringify(ctx.bull)}\n空头：${JSON.stringify(ctx.bear)}\n市场状态：${JSON.stringify(ctx.regimeView)}\n\n请比较证据并给出 outlook 与 recommendation。`);
    const stance = normalizeStance(out.outlook, out.recommendation);
    ctx.synthesis = { ...out, ...stance, evidenceIds: filterEvidenceIds(out.evidenceIds, known()) };
    return { summary: `${stance.outlook} · ${stance.recommendation}`, result: ctx.synthesis, evidenceIds: ctx.synthesis.evidenceIds };
  });

  await rt.step(STEP.trade_scenarios, async () => {
    const levels = [...ctx.features.levels.support, ...ctx.features.levels.resistance];
    if (levels.length === 0) {
      ctx.scenarios = { scenarios: [] };
      return { summary: "无可用价位，跳过情景构造", result: ctx.scenarios };
    }
    const out = await rt.structured("analyst", "trade_scenarios", scenariosOutputSchema, SYSTEM.scenarios, `事实与证据：\n${facts()}\n\n研究结论：${JSON.stringify(ctx.synthesis)}\n\n可引用的价位 levelId 列表：${levels.map((l) => l.id).join(", ")}\n请构造研究性质的情景。`);
    ctx.scenarios = out;
    return { summary: `${out.scenarios.length} 个情景`, result: out };
  });

  await rt.step(STEP.risk_assessment, async () => {
    const base = `事实与证据：\n${facts()}\n\n研究结论：${JSON.stringify(ctx.synthesis)}\n情景：${JSON.stringify(ctx.scenarios)}\n预测状态：${ctx.prediction.status}\n未接入数据：${UNSUPPORTED_DATA_SOURCES.join(", ")}`;
    if (agentSettings().riskMode === "deep") {
      const [agg, con] = [
        await rt.structured("analyst", "risk_aggressive", riskOutputSchema, SYSTEM.riskAggressive, base),
        await rt.structured("analyst", "risk_conservative", riskOutputSchema, SYSTEM.riskConservative, base),
      ];
      ctx.risk = await rt.structured("synth", "risk_neutral", riskOutputSchema, SYSTEM.riskNeutral, `${base}\n\n激进观点：${JSON.stringify(agg)}\n保守观点：${JSON.stringify(con)}`);
    } else {
      ctx.risk = await rt.structured("analyst", "risk_assessment", riskOutputSchema, SYSTEM.risk, base);
    }
    return { summary: `${ctx.risk.observed.length} 项观察风险 · ${ctx.risk.dataGaps.length} 项数据缺口`, result: ctx.risk };
  });

  let report!: AnalysisReport;
  await rt.step(STEP.validate, async () => {
    const levels = [...ctx.features.levels.support, ...ctx.features.levels.resistance];
    const relation = ctx.targetRelation;
    const synthesis = ctx.synthesis ?? { outlook: "uncertain" as const, recommendation: "wait_confirmation" as const, rationale: "研究汇总缺失", conflicts: [], confidenceNote: "无", evidenceIds: [] };
    const modelInfo = getModelInfo();
    report = {
      schemaVersion: 1,
      symbol: ctx.info.symbol,
      exchange: "binance",
      marketType: "spot",
      dataCutoff: ctx.snapshot.meta.dataCutoff,
      snapshotId: ctx.snapshot.meta.snapshotId,
      intervals: rt.config.intervals,
      horizon: rt.config.horizon,
      dataQuality: ctx.snapshot.quality,
      regime: ctx.features.regime,
      indicators: ctx.features.indicators,
      levels: ctx.features.levels,
      alignment: ctx.features.alignment,
      technical: ctx.technical,
      regimeView: ctx.regimeView,
      bull: ctx.bull,
      bear: ctx.bear,
      synthesis,
      scenarios: resolveScenarios(ctx.scenarios, levels, known()),
      risks: ctx.risk ?? { observed: [], dataGaps: ["风险评估缺失"], assumed: [], summary: "" },
      prediction: ctx.prediction,
      targetRange: rt.config.targetRange && relation ? { low: rt.config.targetRange.low, high: rt.config.targetRange.high, relation: relation.relation, note: relation.note } : null,
      unsupported: [...UNSUPPORTED_DATA_SOURCES],
      evidence: ctx.evidence,
      sources: [
        { id: "src:klines", kind: "binance_klines", label: `Binance 现货 ${ctx.info.symbol} ${rt.config.intervals.join("/")} 已收盘 K 线，截止 ${ctx.snapshot.meta.dataCutoff}` },
        { id: "src:indicators", kind: "indicator", label: `指标计算 ${ctx.features.indicators[0]?.version ?? ""}` },
        { id: "src:levels", kind: "level", label: "摆动点聚类支撑阻力" },
        { id: "src:regime", kind: "regime", label: `状态判定 ${ctx.features.regime.version}` },
      ],
      summary: synthesis.rationale.slice(0, 400),
      modelInfo: { provider: modelInfo.provider, analystModel: modelInfo.analystModel, synthModel: modelInfo.synthModel, promptVersion: PROMPT_VERSION },
      createdAt: new Date().toISOString(),
    };
    const issues = validateReport(report);
    if (issues.length) {
      // 情景问题可自动修复：剔除不合法情景；其他问题视为失败
      const fatal = issues.filter((i) => !i.code.startsWith("scenario"));
      report.scenarios = report.scenarios.filter((s) => !issues.some((i) => i.code.startsWith("scenario") && i.message.includes(`「${s.name}」`)));
      if (fatal.length) throw new AgentError(422, "validation", `报告校验失败：${fatal.map((i) => i.message).join("；")}`, { code: "report_invalid" });
    }
    await rt.emit({ type: "report", data: report });
    return { summary: issues.length ? `通过（自动修正 ${issues.length} 项情景问题）` : "通过", result: { issues } };
  });

  await rt.step(STEP.final_report, async () => {
    const text = await rt.narrate(SYSTEM.narrate, `用户问题：${rt.input.question}\n\n结构化报告：\n${compactReport(report)}`, "narration");
    return { summary: `${text.length} 字`, result: { chars: text.length } };
  });
}

/* ---------------------------------- 追问 / 假设 / 澄清 ---------------------------------- */

async function runFollowup(rt: Runtime): Promise<void> {
  let base: { report: AnalysisReport; runId: string; createdAt: string } | null = null;
  await rt.step(STEP.load_context, async () => {
    const id = rt.config.baseReportId ?? rt.input.conversation.currentReportId;
    const tool = rt.toolStart("read_report", "读取历史报告", { reportId: id });
    base = id ? await db.getReportById(id) : null;
    if (!base) {
      await rt.toolEnd(tool, null, "没有可引用的历史报告");
      throw new AgentError(404, "not_found", "当前会话还没有可引用的分析报告，请先发起一次分析", { code: "no_report" });
    }
    await rt.toolEnd(tool, { reportId: id, symbol: base.report.symbol, dataCutoff: base.report.dataCutoff, horizon: base.report.horizon, createdAt: base.createdAt });
    return { summary: `${base.report.symbol} · 数据截止 ${base.report.dataCutoff}`, result: { reportId: id } };
  });
  const b = base as unknown as { report: AnalysisReport; createdAt: string };
  await rt.step(STEP.narrate, async () => {
    const history = await db.loadRecentTextHistory(rt.input.conversation.id, rt.input.userMessage.ordinal, 6);
    const system = rt.kind === "hypothetical" ? SYSTEM.hypothetical : SYSTEM.explain;
    const prompt = `历史报告（数据截止 ${b.report.dataCutoff}，生成于 ${b.createdAt}）：\n${compactReport(b.report)}\n\n近期对话：${JSON.stringify(history)}\n\n${rt.kind === "hypothetical" ? `假设条件：${rt.config.hypothesis ?? rt.input.question}\n` : ""}用户问题：${rt.input.question}`;
    const text = await rt.narrate(system, prompt, "reply", 1_600);
    return { summary: `${text.length} 字` };
  });
}

async function runClarify(rt: Runtime): Promise<void> {
  await rt.step(STEP.narrate, async () => {
    if (!isModelConfigured()) {
      const text = "我需要更多信息才能开始分析：请告诉我要分析的交易对（例如 BTC、ETH、SOL，均为 USDT 现货），以及预测时长（4h / 12h / 24h / 3d / 7d，默认 24h）。";
      await rt.emit({ type: "text-start", id: "reply" });
      await rt.emit({ type: "text-delta", id: "reply", delta: text });
      await rt.emit({ type: "text-end", id: "reply" });
      return { summary: "已请求澄清（无模型）" };
    }
    const text = await rt.narrate(SYSTEM.clarify, `当前会话交易对：${rt.input.conversation.currentSymbol ?? "无"}\n用户消息：${rt.input.question}`, "reply", 400);
    return { summary: `已请求澄清 · ${text.length} 字` };
  });
}
