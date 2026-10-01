import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { AgentError } from "@/lib/agent/errors";
import { agentSettings, type ResolvedAgentSettings } from "@/lib/agent/settings";
import { isResponseFormatUnsupported, parseStructured, resolveStructuredMode, schemaInstruction, type StructuredMode } from "@/lib/agent/structured-json";
import { serverEnv } from "@/lib/env";

export type ModelRole = "analyst" | "synth";

const UNAVAILABLE = "尚未配置模型服务：请在 Agent 设置或环境变量中填写 AI_PROVIDER_BASE_URL、AI_PROVIDER_API_KEY 与 AI_MODEL_ANALYST";

export function isModelConfigured(): boolean {
  const s = touchSettings();
  return Boolean(s.providerBaseUrl && s.providerApiKey && s.modelAnalyst);
}

export function assertModelConfigured(): void {
  if (!isModelConfigured()) {
    throw new AgentError(503, "model_unavailable", UNAVAILABLE);
  }
}

/**
 * 结构化输出模式：
 * - json_schema：response_format=json_schema（OpenAI 等）
 * - json_object：response_format=json_object（DeepSeek 等），schema 写进提示词
 * - prompt：不发送 response_format，schema 写进提示词，服务端提取并校验（兼容性最好）
 * 运行中若网关拒绝 response_format，本进程自动降级为 prompt。
 */
const store = globalThis as unknown as {
  __agentProvider?: { key: string; provider: ReturnType<typeof createOpenAICompatible> };
  __agentStructuredDowngrade?: StructuredMode;
  __agentCfgKey?: string;
};

function fingerprint(s: ResolvedAgentSettings): string {
  return [s.providerBaseUrl, s.providerName, s.providerApiKey, s.supportsStructuredOutputsRaw ?? "", s.structuredOutputModeRaw ?? ""].join("\0");
}

/** 配置变化后丢掉旧客户端，并取消上一次自动降级。 */
function touchSettings(): ResolvedAgentSettings {
  const s = agentSettings();
  const key = fingerprint(s);
  if (store.__agentCfgKey && store.__agentCfgKey !== key) {
    store.__agentProvider = undefined;
    store.__agentStructuredDowngrade = undefined;
  }
  store.__agentCfgKey = key;
  return s;
}

export function structuredMode(): StructuredMode {
  const s = touchSettings();
  return (
    store.__agentStructuredDowngrade ??
    resolveStructuredMode({ mode: s.structuredOutputModeRaw, legacySupports: s.supportsStructuredOutputsRaw })
  );
}

function provider() {
  const s = touchSettings();
  if (!s.providerBaseUrl || !s.providerApiKey || !s.modelAnalyst) {
    throw new AgentError(503, "model_unavailable", UNAVAILABLE);
  }
  const key = fingerprint(s);
  if (!store.__agentProvider || store.__agentProvider.key !== key) {
    store.__agentProvider = {
      key,
      provider: createOpenAICompatible({
        name: s.providerName,
        baseURL: s.providerBaseUrl,
        apiKey: s.providerApiKey,
        includeUsage: true,
      }),
    };
  }
  return store.__agentProvider.provider;
}

function modelId(role: ModelRole): string {
  const s = agentSettings();
  const id = role === "synth" ? s.modelSynth : s.modelAnalyst;
  if (!id) assertModelConfigured();
  return id as string;
}

export function getModel(role: ModelRole): LanguageModel {
  return provider().chatModel(modelId(role));
}

/** 按模式取模型：只有 json_schema 模式才声明 supportsStructuredOutputs */
function getStructuredModel(role: ModelRole, mode: StructuredMode): LanguageModel {
  if (mode !== "json_schema") return getModel(role);
  return provider().languageModel(modelId(role), { supportsStructuredOutputs: true });
}

export function getModelInfo() {
  const s = touchSettings();
  return {
    provider: s.providerName,
    analystModel: s.modelAnalyst ?? "",
    synthModel: s.modelSynth ?? "",
    structuredMode: structuredMode(),
    baseUrlHost: (() => {
      try {
        return s.providerBaseUrl ? new URL(s.providerBaseUrl).host : "";
      } catch {
        return "";
      }
    })(),
  };
}

/** 透传额外请求体字段（AI_EXTRA_BODY，仍只读环境变量） */
export function providerOptions(): Record<string, Record<string, never>> | undefined {
  const extra = serverEnv.aiExtraBody;
  if (!extra) return undefined;
  return { [agentSettings().providerName]: extra as Record<string, never> };
}

/** 输出上限：取调用方给定值与全局配置中的较大者，避免推理模型的思考 token 挤占输出 */
export function outputTokens(requested?: number): number {
  return Math.max(requested ?? 0, serverEnv.agentMaxOutputTokens);
}

/** 单次运行的模型调用预算 */
export class Budget {
  private calls = 0;
  constructor(
    readonly maxCalls: number,
    readonly deadline: number,
  ) {}
  get remainingMs(): number {
    return this.deadline - Date.now();
  }
  consume(): void {
    if (this.remainingMs <= 0) throw new AgentError(504, "timeout", "分析运行超过总时限，已停止", { code: "budget_exceeded" });
    if (this.calls >= this.maxCalls) throw new AgentError(429, "bad_request", "模型调用次数超过预算，已停止", { code: "budget_exceeded" });
    this.calls++;
  }
  get used(): number {
    return this.calls;
  }
}

export interface StructuredCallInput<S extends z.ZodType> {
  role: ModelRole;
  schema: S;
  name: string;
  system: string;
  prompt: string;
  signal: AbortSignal;
  budget: Budget;
  maxOutputTokens?: number;
  temperature?: number;
}

type CallResult<T> = { ok: true; value: T } | { ok: false; error: string; truncated?: boolean };

const TRUNCATED = "输出被截断（达到最大输出 token 上限），JSON 不完整";

async function callOnce<S extends z.ZodType>(input: StructuredCallInput<S>, mode: StructuredMode, repairHint: string, maxOutputTokens: number): Promise<CallResult<z.infer<S>>> {
  const common = {
    model: getStructuredModel(input.role, mode),
    abortSignal: input.signal,
    maxOutputTokens,
    temperature: input.temperature ?? 0.2,
    maxRetries: 1,
    providerOptions: providerOptions(),
  };
  if (mode === "prompt") {
    const res = await generateText({
      ...common,
      system: `${input.system}\n\n${schemaInstruction(input.schema, input.name)}`,
      prompt: input.prompt + repairHint,
    });
    const parsed = parseStructured(input.schema, res.text);
    if (!parsed.ok && res.finishReason === "length") return { ok: false, error: TRUNCATED, truncated: true };
    return parsed;
  }
  try {
    const res = await generateText({
      ...common,
      output: Output.object({ schema: input.schema, name: input.name }),
      // json_object 模式下模型看不到 schema，需要写进提示词
      system: mode === "json_object" ? `${input.system}\n\n${schemaInstruction(input.schema, input.name)}` : input.system,
      prompt: input.prompt + repairHint,
    });
    return { ok: true, value: res.output as z.infer<S> };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      // 部分模型会包一层代码块或多输出说明文字：再尝试一次宽松提取
      const loose = err.text ? parseStructured(input.schema, err.text) : ({ ok: false, error: err.message } as const);
      if (!loose.ok && err.finishReason === "length") return { ok: false, error: TRUNCATED, truncated: true };
      return loose;
    }
    throw err;
  }
}

/**
 * 结构化输出：按模式调用并用 zod 校验；校验失败时附带错误重试一次。
 * 网关不支持 response_format 时自动降级为 prompt 模式（本进程内记住）。
 */
export async function generateStructured<S extends z.ZodType>(input: StructuredCallInput<S>): Promise<z.infer<S>> {
  let mode = structuredMode();
  let lastError = "";
  let attempts = 0;
  let maxTokens = outputTokens(input.maxOutputTokens);
  while (attempts < 2) {
    input.signal.throwIfAborted();
    input.budget.consume();
    attempts++;
    const hint = !lastError
      ? ""
      : lastError === TRUNCATED
        ? "\n\n上一次输出过长被截断。请大幅精简：每个数组最多 3 条，每条不超过 50 字，只输出 JSON。"
        : `\n\n上一次输出未通过结构校验：${lastError.slice(0, 600)}。请严格按要求只输出符合 schema 的 JSON。`;
    try {
      const r = await callOnce(input, mode, hint, maxTokens);
      if (r.ok) return r.value;
      lastError = r.error;
      if (!r.ok && r.truncated) maxTokens = Math.round(maxTokens * 1.5);
    } catch (err) {
      if (input.signal.aborted) throw err;
      if (mode !== "prompt" && isResponseFormatUnsupported(err)) {
        console.warn(`[agent] 模型服务不支持 response_format（${mode}），已降级为 prompt 模式`);
        store.__agentStructuredDowngrade = "prompt";
        mode = "prompt";
        attempts--; // 降级重试不计入校验重试次数（仍计入模型调用预算）
        continue;
      }
      throw err;
    }
  }
  throw new AgentError(502, "bad_request", `模型输出多次未通过结构化校验：${lastError.slice(0, 200)}`, {
    code: lastError === TRUNCATED ? "structured_output_truncated" : "structured_output_invalid",
    cause: lastError.slice(0, 300),
  });
}
