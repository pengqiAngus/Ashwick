/**
 * 环境变量读取与默认值。
 * - serverEnv 仅在服务端使用。
 * - publicEnv 中的 NEXT_PUBLIC_* 变量在构建时内联，客户端可读。
 */

function toInt(raw: string | undefined, fallback: number, min = 0): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

const DEFAULT_BINANCE_BASE_URL = "https://api.binance.com";

export const serverEnv = {
  get binanceBaseUrl(): string {
    return (process.env.BINANCE_API_BASE_URL || DEFAULT_BINANCE_BASE_URL).replace(/\/+$/, "");
  },
  get symbolsCacheTtlMs(): number {
    return toInt(process.env.SYMBOLS_CACHE_TTL_MS, 3_600_000, 60_000);
  },
  /** 单次请求币安接口的超时时间 */
  binanceTimeoutMs: 8_000,

  /* ---------- Agent / 模型服务（仅服务端） ---------- */
  get aiProviderName(): string {
    return process.env.AI_PROVIDER_NAME || "openai-compatible";
  },
  get aiProviderBaseUrl(): string | null {
    const v = process.env.AI_PROVIDER_BASE_URL?.trim();
    return v ? v.replace(/\/+$/, "") : null;
  },
  get aiProviderApiKey(): string | null {
    const v = process.env.AI_PROVIDER_API_KEY?.trim();
    return v || null;
  },
  get aiModelAnalyst(): string | null {
    return process.env.AI_MODEL_ANALYST?.trim() || null;
  },
  get aiModelSynth(): string | null {
    return process.env.AI_MODEL_SYNTH?.trim() || process.env.AI_MODEL_ANALYST?.trim() || null;
  },
  /** 旧开关，仅用于推导 aiStructuredOutputMode 的默认值 */
  get aiSupportsStructuredOutputsRaw(): string | undefined {
    return process.env.AI_SUPPORTS_STRUCTURED_OUTPUTS;
  },
  /** json_schema | json_object | prompt */
  get aiStructuredOutputModeRaw(): string | undefined {
    return process.env.AI_STRUCTURED_OUTPUT_MODE;
  },
  /** 单次模型调用的最大输出 token（推理模型的思考 token 通常也计入） */
  get agentMaxOutputTokens(): number {
    return toInt(process.env.AGENT_MAX_OUTPUT_TOKENS, 4_096, 512);
  },
  /** 透传给模型服务请求体的额外字段（JSON 对象），如豆包关闭深度思考：{"thinking":{"type":"disabled"}} */
  get aiExtraBody(): Record<string, unknown> | null {
    const raw = process.env.AI_EXTRA_BODY?.trim();
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      console.warn("[env] AI_EXTRA_BODY 不是合法 JSON，已忽略");
      return null;
    }
  },
  /** 单次分析运行总时限 */
  get agentMaxRunMs(): number {
    return toInt(process.env.AGENT_MAX_RUN_MS, 240_000, 30_000);
  },
  /** 单次运行允许的模型调用次数 */
  get agentMaxModelCalls(): number {
    return toInt(process.env.AGENT_MAX_MODEL_CALLS, 14, 1);
  },
  get agentDebateRounds(): number {
    return toInt(process.env.AGENT_DEBATE_ROUNDS, 1, 1);
  },
  get agentMaxInputChars(): number {
    return toInt(process.env.AGENT_MAX_INPUT_CHARS, 4_000, 200);
  },
  get agentRiskMode(): "fast" | "deep" {
    return process.env.AGENT_RISK_MODE === "deep" ? "deep" : "fast";
  },
  /** 心跳超过该时长视为孤儿运行 */
  agentOrphanAfterMs: 90_000,
};

export const publicEnv = {
  /** 最新报价与 24 小时行情刷新间隔，最小 1 秒 */
  quoteRefreshMs: toInt(process.env.NEXT_PUBLIC_QUOTE_REFRESH_MS, 3_000, 1_000),
  /** 报价超过该时长未刷新即视为过期 */
  quoteStaleMs: toInt(process.env.NEXT_PUBLIC_QUOTE_STALE_MS, 60_000, 10_000),
};
