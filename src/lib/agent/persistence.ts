/**
 * Agent 相关表的唯一访问层。所有状态迁移都使用条件 updateMany（CAS），
 * 保证并发请求、Strict Mode、多标签与刷新都不会重复启动运行。
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { Prisma, type AnalysisRun, type AnalysisStep, type Conversation, type Message } from "@/generated/prisma/client";
import { ClaimConflict, isP2002 } from "@/lib/agent/errors";
import {
  agentMetadataSchema,
  analysisReportSchema,
  horizonSchema,
  klineIntervalSchema,
  runConfigSchema,
  runErrorSchema,
  RUN_ACTIVE_STATUSES,
  snapshotMetaSchema,
  stepDataSchema,
  uiMessageSchema,
  type AgentMetadata,
  type AgentUIMessage,
  type AnalysisReport,
  type ConversationView,
  type Horizon,
  type KlineIntervalValue,
  type RunConfig,
  type RunDetail,
  type RunError,
  type RunKind,
  type RunStatus,
  type RunSummary,
  type SnapshotMeta,
  type StepData,
} from "@/lib/agent/schemas";

type Json = Prisma.InputJsonValue;
const asJson = (v: unknown): Json => v as Json;
const nowIso = () => new Date().toISOString();

/* ---------------------------------- 转换 ---------------------------------- */

function parseIntervals(list: string[]): KlineIntervalValue[] {
  return list.filter((x): x is KlineIntervalValue => klineIntervalSchema.safeParse(x).success);
}

function parseHorizon(h: string | null): Horizon | null {
  const r = horizonSchema.safeParse(h);
  return r.success ? r.data : null;
}

export function toUIMessage(row: Message): AgentUIMessage {
  const parsed = uiMessageSchema.safeParse({ id: row.id, role: row.role, metadata: row.metadata ?? undefined, parts: row.parts });
  const meta = agentMetadataSchema.safeParse(row.metadata);
  const metadata: AgentMetadata = meta.success
    ? { ...meta.data, status: row.status }
    : { runId: row.currentRunId, kind: null, createdAt: row.createdAt.toISOString(), status: row.status };
  if (!parsed.success) {
    return { id: row.id, role: row.role, metadata, parts: [{ type: "text", text: "（消息数据无法解析）" }] };
  }
  return { id: row.id, role: row.role, metadata, parts: parsed.data.parts as AgentUIMessage["parts"] };
}

export function parseRunConfig(raw: unknown): RunConfig | null {
  const r = runConfigSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function toRunSummary(run: AnalysisRun): RunSummary {
  const cfg = parseRunConfig(run.config);
  const err = runErrorSchema.safeParse(run.error);
  return {
    runId: run.id,
    status: run.status,
    kind: run.kind,
    attempt: run.attempt,
    symbol: cfg?.symbol ?? null,
    intervals: cfg?.intervals ?? [],
    horizon: cfg?.horizon ?? null,
    messageId: run.messageId,
    assistantMessageId: run.assistantMessageId,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    error: err.success ? err.data : null,
  };
}

function stepToData(s: AnalysisStep): StepData {
  const err = runErrorSchema.safeParse(s.error);
  return {
    stepId: s.stepId,
    order: s.order,
    name: s.name,
    status: s.status,
    startedAt: s.startedAt?.toISOString() ?? null,
    finishedAt: s.finishedAt?.toISOString() ?? null,
    durationMs: s.durationMs,
    summary: s.summary,
    error: err.success ? err.data : null,
    evidenceIds: s.evidenceIds,
  };
}

export function isOrphan(run: Pick<AnalysisRun, "status" | "heartbeatAt" | "createdAt">, now = Date.now()): boolean {
  if (!(RUN_ACTIVE_STATUSES as string[]).includes(run.status)) return false;
  const last = run.heartbeatAt?.getTime() ?? run.createdAt.getTime();
  return now - last > serverEnv.agentOrphanAfterMs;
}

/* ---------------------------------- 会话创建 ---------------------------------- */

export interface CreateLaunchInput {
  source: "favorite_card" | "manual";
  launchId: string;
  text: string;
  symbol: string | null;
  intervals: KlineIntervalValue[];
  horizon: Horizon;
  title: string;
}

/** 创建会话 + 首条 pending_run 用户消息（单事务）；launchId 重复时返回已存在记录 */
export async function createLaunchConversation(input: CreateLaunchInput): Promise<{ conversationId: string; messageId: string; created: boolean }> {
  const db = getDb();
  try {
    const conv = await db.conversation.create({
      data: {
        source: input.source,
        title: input.title,
        currentSymbol: input.symbol,
        currentIntervals: input.intervals,
        currentHorizon: input.horizon,
        messageCount: 1,
        messages: {
          create: [
            {
              role: "user",
              ordinal: 0,
              status: "pending_run",
              launchId: input.launchId,
              parts: asJson([{ type: "text", text: input.text }]),
              metadata: asJson({ runId: null, kind: null, createdAt: nowIso() }),
            },
          ],
        },
      },
      include: { messages: true },
    });
    return { conversationId: conv.id, messageId: conv.messages[0].id, created: true };
  } catch (err) {
    if (isP2002(err, "launchId")) {
      const existing = await db.message.findUnique({ where: { launchId: input.launchId } });
      if (existing) return { conversationId: existing.conversationId, messageId: existing.id, created: false };
    }
    throw err;
  }
}

/* ---------------------------------- 读取视图 ---------------------------------- */

async function loadReport(reportId: string | null): Promise<AnalysisReport | null> {
  if (!reportId) return null;
  const row = await getDb().analysisReport.findUnique({ where: { id: reportId } });
  if (!row) return null;
  const parsed = analysisReportSchema.safeParse(row.report);
  return parsed.success ? parsed.data : null;
}

export async function getConversationView(id: string): Promise<ConversationView | null> {
  const db = getDb();
  const conv = await db.conversation.findUnique({ where: { id }, include: { messages: { orderBy: { ordinal: "asc" } } } });
  if (!conv) return null;
  let activeRun: AnalysisRun | null = conv.activeRunId ? await db.analysisRun.findUnique({ where: { id: conv.activeRunId } }) : null;
  if (activeRun && isOrphan(activeRun)) {
    await reapOrphan(activeRun.id);
    activeRun = null;
  }
  const users = conv.messages.filter((m) => m.role === "user");
  const pending = !activeRun ? users.find((m) => m.status === "pending_run") ?? null : null;
  const retryable = !activeRun && !pending ? [...users].reverse().find((m) => m.status === "failed" || m.status === "cancelled") ?? null : null;
  const currentReport = await loadReport(conv.currentReportId);
  return {
    conversation: {
      id: conv.id,
      title: conv.title,
      source: conv.source,
      currentSymbol: conv.currentSymbol,
      currentIntervals: parseIntervals(conv.currentIntervals),
      currentHorizon: parseHorizon(conv.currentHorizon),
      currentReportId: conv.currentReportId,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    },
    messages: conv.messages.map(toUIMessage),
    activeRun: activeRun ? toRunSummary(activeRun) : null,
    pendingMessageId: pending?.id ?? null,
    retryableMessageId: retryable?.id ?? null,
    currentReport,
  };
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return getDb().conversation.findUnique({ where: { id } });
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const db = getDb();
  const run = await db.analysisRun.findUnique({ where: { id: runId }, include: { steps: { orderBy: { order: "asc" } }, report: true } });
  if (!run) return null;
  if (isOrphan(run)) {
    await reapOrphan(run.id);
    const fresh = await db.analysisRun.findUnique({ where: { id: runId }, include: { steps: { orderBy: { order: "asc" } }, report: true } });
    if (fresh) Object.assign(run, fresh);
  }
  const assistant = run.assistantMessageId ? await db.message.findUnique({ where: { id: run.assistantMessageId } }) : null;
  const user = await db.message.findUnique({ where: { id: run.messageId }, select: { status: true } });
  const report = run.report ? analysisReportSchema.safeParse(run.report.report) : null;
  return {
    run: toRunSummary(run),
    steps: run.steps.map(stepToData),
    report: report?.success ? report.data : null,
    assistantMessage: assistant ? toUIMessage(assistant) : null,
    userMessageStatus: user?.status ?? null,
  };
}

export async function getReportById(id: string): Promise<{ report: AnalysisReport; runId: string; createdAt: string } | null> {
  const row = await getDb().analysisReport.findUnique({ where: { id } });
  if (!row) return null;
  const parsed = analysisReportSchema.safeParse(row.report);
  if (!parsed.success) return null;
  return { report: parsed.data, runId: row.runId, createdAt: row.createdAt.toISOString() };
}

/** 供模型使用的近期文本历史（不含工具结果，避免把客户端伪造内容当事实） */
export async function loadRecentTextHistory(conversationId: string, beforeOrdinal: number, limit = 8): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
  const rows = await getDb().message.findMany({
    where: { conversationId, ordinal: { lt: beforeOrdinal } },
    orderBy: { ordinal: "desc" },
    take: limit,
  });
  return rows
    .reverse()
    .filter((m) => m.role !== "system")
    .map((m) => {
      const ui = toUIMessage(m);
      const text = ui.parts
        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .trim();
      return { role: m.role as "user" | "assistant", text: text.slice(0, 2_000) };
    })
    .filter((m) => m.text.length > 0);
}

/* ---------------------------------- 用户消息持久化（模式 B） ---------------------------------- */

export async function persistUserMessage(conversationId: string, message: { id: string; parts: unknown[] }): Promise<Message> {
  const db = getDb();
  const existing = await db.message.findUnique({ where: { conversationId_clientMessageId: { conversationId, clientMessageId: message.id } } });
  if (existing) return existing;
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.conversation.update({ where: { id: conversationId }, data: { messageCount: { increment: 1 } }, select: { messageCount: true } });
      return tx.message.create({
        data: {
          conversationId,
          role: "user",
          ordinal: c.messageCount - 1,
          status: "pending_run",
          clientMessageId: message.id,
          parts: asJson(message.parts),
          metadata: asJson({ runId: null, kind: null, createdAt: nowIso() }),
        },
      });
    });
  } catch (err) {
    if (isP2002(err)) {
      const again = await db.message.findUnique({ where: { conversationId_clientMessageId: { conversationId, clientMessageId: message.id } } });
      if (again) return again;
    }
    throw err;
  }
}

/* ---------------------------------- claim ---------------------------------- */

export interface ClaimResult {
  run: AnalysisRun;
  userMessage: Message;
  assistantMessage: Message;
}

/**
 * 原子占有一条用户消息并创建运行：
 * 1) 消息 pending_run|failed|cancelled → running（CAS）
 * 2) 会话 activeRunId null → runId（CAS）
 * 3) 复用 / 创建 assistant 消息
 * 4) 创建 AnalysisRun
 * 任一 CAS 失败即回滚并抛 ClaimConflict。
 */
export async function claimRun(input: { conversationId: string; messageId: string; kind: RunKind; config: RunConfig }): Promise<ClaimResult> {
  const db = getDb();
  const runId = randomUUID();
  return db.$transaction(async (tx) => {
    const m = await tx.message.updateMany({
      where: { id: input.messageId, conversationId: input.conversationId, role: "user", status: { in: ["pending_run", "failed", "cancelled"] } },
      data: { status: "running", attemptCount: { increment: 1 } },
    });
    if (m.count !== 1) throw new ClaimConflict("message");
    const userMessage = await tx.message.findUniqueOrThrow({ where: { id: input.messageId } });

    const c = await tx.conversation.updateMany({ where: { id: input.conversationId, activeRunId: null }, data: { activeRunId: runId } });
    if (c.count !== 1) throw new ClaimConflict("conversation");

    let assistantMessage = await tx.message.findUnique({ where: { replyToMessageId: input.messageId } });
    const meta = asJson({ runId, kind: input.kind, createdAt: nowIso() });
    if (assistantMessage) {
      assistantMessage = await tx.message.update({ where: { id: assistantMessage.id }, data: { status: "running", parts: asJson([]), metadata: meta, currentRunId: runId } });
    } else {
      const conv = await tx.conversation.update({ where: { id: input.conversationId }, data: { messageCount: { increment: 1 } }, select: { messageCount: true } });
      assistantMessage = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: "assistant",
          ordinal: conv.messageCount - 1,
          status: "running",
          replyToMessageId: input.messageId,
          currentRunId: runId,
          parts: asJson([]),
          metadata: meta,
        },
      });
    }

    const run = await tx.analysisRun.create({
      data: {
        id: runId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        attempt: userMessage.attemptCount,
        idempotencyKey: `msg:${input.messageId}:${userMessage.attemptCount}`,
        assistantMessageId: assistantMessage.id,
        status: "queued",
        kind: input.kind,
        config: asJson(input.config),
        heartbeatAt: new Date(),
      },
    });
    await tx.message.update({ where: { id: input.messageId }, data: { currentRunId: runId } });
    return { run, userMessage, assistantMessage };
  });
}

export type ConflictInfo =
  | { kind: "active_run"; run: RunSummary }
  | { kind: "message_done"; messageStatus: string; runId: string | null }
  | { kind: "unknown" };

/** claim 失败后查明原因，供接口返回 409 details */
export async function describeConflict(conversationId: string, messageId: string): Promise<ConflictInfo> {
  const db = getDb();
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { activeRunId: true } });
  if (conv?.activeRunId) {
    const run = await db.analysisRun.findUnique({ where: { id: conv.activeRunId } });
    if (run) return { kind: "active_run", run: toRunSummary(run) };
  }
  const msg = await db.message.findUnique({ where: { id: messageId }, select: { status: true, currentRunId: true } });
  if (msg) return { kind: "message_done", messageStatus: msg.status, runId: msg.currentRunId };
  return { kind: "unknown" };
}

/** 若会话的活跃运行已无心跳，则回收；返回是否回收了 */
export async function reapOrphanForConversation(conversationId: string): Promise<boolean> {
  const db = getDb();
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { activeRunId: true } });
  if (!conv?.activeRunId) return false;
  const run = await db.analysisRun.findUnique({ where: { id: conv.activeRunId } });
  if (!run || !isOrphan(run)) return false;
  return reapOrphan(run.id);
}

export async function reapOrphan(runId: string): Promise<boolean> {
  const error: RunError = { code: "orphaned", message: "运行进程失去心跳，已标记为失败；可以重试", retryable: true };
  const res = await finalizeRun({ runId, terminal: "failed", error, parts: null, metadata: null });
  return res === "finalized";
}

/* ---------------------------------- 运行中的写入 ---------------------------------- */

/** 心跳并读回状态；返回 null 表示运行不存在 */
export async function heartbeat(runId: string): Promise<RunStatus | null> {
  const db = getDb();
  const r = await db.analysisRun.updateMany({ where: { id: runId, status: { in: ["queued", "running", "cancelling"] } }, data: { heartbeatAt: new Date() } });
  if (r.count === 0) {
    const row = await db.analysisRun.findUnique({ where: { id: runId }, select: { status: true } });
    return row?.status ?? null;
  }
  const row = await db.analysisRun.findUnique({ where: { id: runId }, select: { status: true } });
  return row?.status ?? null;
}

export async function markRunRunning(runId: string, patch: { kind?: RunKind; config?: RunConfig; model?: unknown }): Promise<boolean> {
  const r = await getDb().analysisRun.updateMany({
    where: { id: runId, status: "queued" },
    data: {
      status: "running",
      startedAt: new Date(),
      heartbeatAt: new Date(),
      ...(patch.kind ? { kind: patch.kind } : {}),
      ...(patch.config ? { config: asJson(patch.config) } : {}),
      ...(patch.model !== undefined ? { model: asJson(patch.model) } : {}),
    },
  });
  return r.count === 1;
}

export async function updateRunConfig(runId: string, patch: { kind?: RunKind; config?: RunConfig }): Promise<void> {
  await getDb().analysisRun.updateMany({
    where: { id: runId, status: { in: ["queued", "running", "cancelling"] } },
    data: { ...(patch.kind ? { kind: patch.kind } : {}), ...(patch.config ? { config: asJson(patch.config) } : {}) },
  });
}

export async function upsertStep(runId: string, step: StepData, result?: unknown): Promise<void> {
  const data = stepDataSchema.parse(step);
  const base = {
    order: data.order,
    name: data.name,
    status: data.status,
    startedAt: data.startedAt ? new Date(data.startedAt) : null,
    finishedAt: data.finishedAt ? new Date(data.finishedAt) : null,
    durationMs: data.durationMs,
    summary: data.summary,
    error: data.error ? asJson(data.error) : Prisma.DbNull,
    evidenceIds: data.evidenceIds,
    ...(result !== undefined ? { result: asJson(result) } : {}),
  };
  await getDb().analysisStep.upsert({
    where: { runId_stepId: { runId, stepId: data.stepId } },
    create: { runId, stepId: data.stepId, ...base },
    update: base,
  });
}

export async function saveSnapshot(runId: string, meta: SnapshotMeta): Promise<void> {
  await getDb().analysisRun.updateMany({ where: { id: runId }, data: { snapshot: asJson(snapshotMetaSchema.parse(meta)) } });
}

export async function saveReport(runId: string, conversationId: string, report: AnalysisReport): Promise<string> {
  const data = analysisReportSchema.parse(report);
  const row = await getDb().analysisReport.upsert({
    where: { runId },
    create: {
      runId,
      conversationId,
      symbol: data.symbol,
      intervals: data.intervals,
      horizon: data.horizon,
      snapshotId: data.snapshotId,
      dataCutoff: new Date(data.dataCutoff),
      report: asJson(data),
      predictionStatus: data.prediction.status,
      modelVersion: data.prediction.modelVersion,
      schemaVersion: data.schemaVersion,
    },
    update: { report: asJson(data), predictionStatus: data.prediction.status, modelVersion: data.prediction.modelVersion },
  });
  return row.id;
}

/** 流式过程中定期把 assistant parts 写库，保证断线后可恢复 */
export async function saveAssistantParts(assistantMessageId: string, parts: AgentUIMessage["parts"], metadata: AgentMetadata): Promise<void> {
  await getDb().message.updateMany({
    where: { id: assistantMessageId, status: "running" },
    data: { parts: asJson(parts), metadata: asJson(metadata) },
  });
}

/* ---------------------------------- 终态 ---------------------------------- */

export interface FinalizeInput {
  runId: string;
  terminal: "completed" | "failed" | "cancelled";
  error?: RunError | null;
  parts: AgentUIMessage["parts"] | null;
  metadata: AgentMetadata | null;
  /** 成功时更新会话当前上下文 */
  conversationPatch?: { reportId: string; symbol: string; intervals: KlineIntervalValue[]; horizon: Horizon } | null;
}

/**
 * 运行终态迁移（单事务）。运行已是终态时不做任何事，避免取消 / 回收 / 正常结束互相覆盖。
 */
export async function finalizeRun(input: FinalizeInput): Promise<"finalized" | "already-terminal" | "missing"> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const r = await tx.analysisRun.updateMany({
      where: { id: input.runId, status: { in: ["queued", "running", "cancelling"] } },
      data: { status: input.terminal, finishedAt: new Date(), error: input.error ? asJson(input.error) : Prisma.DbNull },
    });
    if (r.count === 0) {
      const exists = await tx.analysisRun.findUnique({ where: { id: input.runId }, select: { id: true } });
      return exists ? "already-terminal" : "missing";
    }
    const run = await tx.analysisRun.findUniqueOrThrow({ where: { id: input.runId } });
    await tx.conversation.updateMany({
      where: { id: run.conversationId, activeRunId: input.runId },
      data: {
        activeRunId: null,
        ...(input.terminal === "completed" && input.conversationPatch
          ? {
              currentReportId: input.conversationPatch.reportId,
              currentSymbol: input.conversationPatch.symbol,
              currentIntervals: input.conversationPatch.intervals,
              currentHorizon: input.conversationPatch.horizon,
            }
          : {}),
      },
    });
    const msgStatus = input.terminal === "completed" ? "complete" : input.terminal;
    await tx.message.updateMany({ where: { id: run.messageId, currentRunId: input.runId }, data: { status: msgStatus } });
    if (run.assistantMessageId) {
      await tx.message.updateMany({
        where: { id: run.assistantMessageId, currentRunId: input.runId },
        data: {
          status: msgStatus,
          ...(input.parts ? { parts: asJson(input.parts) } : {}),
          ...(input.metadata ? { metadata: asJson(input.metadata) } : {}),
        },
      });
    }
    // 未终结的步骤按运行结果收尾
    const stepStatus = input.terminal === "cancelled" ? "cancelled" : input.terminal === "failed" ? "skipped" : "completed";
    await tx.analysisStep.updateMany({ where: { runId: input.runId, status: { in: ["pending", "running"] } }, data: { status: stepStatus, finishedAt: new Date() } });
    return "finalized";
  });
}

/** 取消：queued|running → cancelling；返回当前状态 */
export async function requestCancel(runId: string): Promise<RunStatus | null> {
  const db = getDb();
  await db.analysisRun.updateMany({ where: { id: runId, status: { in: ["queued", "running"] } }, data: { status: "cancelling" } });
  const row = await db.analysisRun.findUnique({ where: { id: runId }, select: { status: true } });
  return row?.status ?? null;
}

export async function getRun(runId: string): Promise<AnalysisRun | null> {
  return getDb().analysisRun.findUnique({ where: { id: runId } });
}

export async function getMessage(id: string): Promise<Message | null> {
  return getDb().message.findUnique({ where: { id } });
}

export async function setConversationTitle(conversationId: string, title: string): Promise<void> {
  await getDb().conversation.updateMany({ where: { id: conversationId, title: null }, data: { title } });
}
