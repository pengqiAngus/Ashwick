/**
 * Agent 工作台共享数据结构（zod）。
 * 该文件同时被服务端与客户端导入，不得引用 Prisma / 服务端模块。
 */
import { z } from "zod";
import type { UIMessage } from "ai";
import { KLINE_INTERVALS } from "@/lib/types";

/* ---------------------------------- 基础枚举 ---------------------------------- */

export const klineIntervalSchema = z.enum(KLINE_INTERVALS);
export type KlineIntervalValue = z.infer<typeof klineIntervalSchema>;

export const HORIZONS = ["4h", "12h", "24h", "3d", "7d"] as const;
export const horizonSchema = z.enum(HORIZONS);
export type Horizon = z.infer<typeof horizonSchema>;
export const DEFAULT_HORIZON: Horizon = "24h";
export const DEFAULT_AGENT_INTERVALS: KlineIntervalValue[] = ["1h", "4h", "1d"];

export const runStatusSchema = z.enum(["queued", "running", "cancelling", "completed", "failed", "cancelled"]);
export type RunStatus = z.infer<typeof runStatusSchema>;
export const RUN_TERMINAL_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];
export const RUN_ACTIVE_STATUSES: RunStatus[] = ["queued", "running", "cancelling"];

export const runKindSchema = z.enum([
  "undetermined",
  "full_analysis",
  "followup_explain",
  "hypothetical",
  "refresh",
  "change_horizon",
  "switch_symbol",
  "clarify",
]);
export type RunKind = z.infer<typeof runKindSchema>;

export const stepStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped", "cancelled"]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const messageStatusSchema = z.enum(["pending_run", "running", "complete", "failed", "cancelled"]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const predictionStatusSchema = z.enum(["unavailable", "not_configured", "insufficient_data", "ok"]);
export type PredictionStatus = z.infer<typeof predictionStatusSchema>;

/* ---------------------------------- 运行配置 ---------------------------------- */

export const runErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  stepId: z.string().optional(),
  retryable: z.boolean().optional(),
  cause: z.string().optional(),
});
export type RunError = z.infer<typeof runErrorSchema>;

export const targetRangeSchema = z
  .object({
    /** 十进制字符串，来自数据库 Decimal */
    low: z.string(),
    high: z.string(),
  })
  .nullable();
export type TargetRange = z.infer<typeof targetRangeSchema>;

export const runConfigSchema = z.object({
  symbol: z.string().nullable(),
  intervals: z.array(klineIntervalSchema),
  horizon: horizonSchema,
  targetRange: targetRangeSchema,
  /** 触发本次运行的用户原话 */
  question: z.string(),
  /** 追问 / 假设情景所依据的报告 */
  baseReportId: z.string().nullable().optional(),
  /** 假设情景的条件（仅 hypothetical） */
  hypothesis: z.string().nullable().optional(),
});
export type RunConfig = z.infer<typeof runConfigSchema>;

/* ---------------------------------- 快照与数据质量 ---------------------------------- */

export const snapshotIntervalMetaSchema = z.object({
  interval: klineIntervalSchema,
  count: z.number().int().nonnegative(),
  /** 毫秒时间戳 */
  firstOpenTime: z.number().nullable(),
  lastCloseTime: z.number().nullable(),
});

export const snapshotMetaSchema = z.object({
  snapshotId: z.string(),
  symbol: z.string(),
  exchange: z.literal("binance"),
  marketType: z.literal("spot"),
  /** 所有周期共同的数据截止时间（ISO） */
  dataCutoff: z.string(),
  fetchedAt: z.string(),
  intervals: z.array(snapshotIntervalMetaSchema),
});
export type SnapshotMeta = z.infer<typeof snapshotMetaSchema>;

export const intervalQualitySchema = z.object({
  interval: klineIntervalSchema,
  count: z.number().int(),
  required: z.number().int(),
  gaps: z.number().int(),
  duplicatesRemoved: z.number().int(),
  invalidRemoved: z.number().int(),
  /** 最后一根已收盘 K 线距离快照时间的毫秒数 */
  staleMs: z.number().nullable(),
  ok: z.boolean(),
  warnings: z.array(z.string()),
});

export const dataQualitySchema = z.object({
  ok: z.boolean(),
  perInterval: z.array(intervalQualitySchema),
  warnings: z.array(z.string()),
});
export type DataQuality = z.infer<typeof dataQualitySchema>;

/* ---------------------------------- 量化结果 ---------------------------------- */

const num = z.number().finite();
const numOrNull = num.nullable();

export const indicatorSetSchema = z.object({
  interval: klineIntervalSchema,
  barsUsed: z.number().int(),
  lastClose: num,
  lastCloseTime: z.number(),
  ema20: numOrNull,
  ema50: numOrNull,
  ema200: numOrNull,
  rsi14: numOrNull,
  macd: z.object({ macd: num, signal: num, histogram: num }).nullable(),
  atr14: numOrNull,
  /** ATR / 收盘价 */
  atrPct: numOrNull,
  bb: z.object({ middle: num, upper: num, lower: num, widthPct: num, percentB: num }).nullable(),
  returns: z.object({ r1: numOrNull, r5: numOrNull, r20: numOrNull }),
  /** 近 20 根对数收益率标准差（按周期，不年化） */
  realizedVol20: numOrNull,
  /** 最近一根成交量 / 近 20 根均量 - 1 */
  volumeChange20: numOrNull,
  params: z.record(z.string(), z.number()),
  version: z.string(),
});
export type IndicatorSet = z.infer<typeof indicatorSetSchema>;

export const levelSchema = z.object({
  id: z.string(),
  side: z.enum(["support", "resistance"]),
  price: num,
  method: z.enum(["swing", "cluster"]),
  touches: z.number().int(),
  interval: klineIntervalSchema,
  /** 形成该价位的 K 线开盘时间（毫秒） */
  sourceBarTimes: z.array(z.number()),
  /** (price - lastClose) / lastClose */
  distancePct: num,
});
export type Level = z.infer<typeof levelSchema>;

export const regimeLabelSchema = z.enum(["trending_up", "trending_down", "ranging", "volatile", "unclear"]);

export const regimeSchema = z.object({
  label: regimeLabelSchema,
  byInterval: z.array(
    z.object({
      interval: klineIntervalSchema,
      trend: z.enum(["up", "down", "flat"]),
      volatility: z.enum(["low", "normal", "high"]),
      emaStack: z.enum(["bullish", "bearish", "mixed"]),
      emaSlopePct: numOrNull,
      bbWidthPercentile: numOrNull,
    }),
  ),
  evidence: z.array(z.string()),
  version: z.string(),
});
export type Regime = z.infer<typeof regimeSchema>;

export const alignmentSchema = z.object({
  /** -1..1，各周期趋势方向加权平均 */
  score: num,
  agree: z.boolean(),
  detail: z.string(),
});

export const predictionResultSchema = z.object({
  status: predictionStatusSchema,
  modelVersion: z.string().nullable(),
  horizon: horizonSchema,
  upProbability: z.number().min(0).max(1).nullable(),
  expectedReturn: numOrNull,
  threshold: numOrNull,
  trainedUntil: z.string().nullable(),
  note: z.string(),
});
export type PredictionResult = z.infer<typeof predictionResultSchema>;

/* ---------------------------------- 证据 ---------------------------------- */

export const evidenceSchema = z.object({
  id: z.string(),
  stepId: z.string(),
  kind: z.enum(["indicator", "level", "regime", "data", "prediction", "alignment", "target_range"]),
  text: z.string(),
  values: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/* ---------------------------------- 模型输出（各角色） ---------------------------------- */

const idList = z.array(z.string()).default([]);

export const technicalAnalystOutputSchema = z.object({
  trend: z.string(),
  momentum: z.string(),
  volume: z.string(),
  volatility: z.string(),
  conflicts: z.array(z.string()),
  summary: z.string(),
  evidenceIds: idList,
});

export const regimeAgentOutputSchema = z.object({
  label: regimeLabelSchema,
  effectOnSignals: z.string(),
  summary: z.string(),
  evidenceIds: idList,
});

export const researchOutputSchema = z.object({
  evidence: z.array(z.string()),
  confirmations: z.array(z.string()),
  invalidation: z.array(z.string()),
  evidenceIds: idList,
});

export const outlookSchema = z.enum(["bullish", "bearish", "neutral", "uncertain"]);
export const recommendationSchema = z.enum(["watch", "wait_confirmation", "avoid"]);

export const synthesisOutputSchema = z.object({
  outlook: outlookSchema,
  recommendation: recommendationSchema,
  rationale: z.string(),
  conflicts: z.array(z.string()),
  /** 对证据质量的说明，不是概率 */
  confidenceNote: z.string(),
  evidenceIds: idList,
});

/** 情景 Agent 只允许引用已有价位 id，价格由服务端解析 */
export const scenariosOutputSchema = z.object({
  scenarios: z
    .array(
      z.object({
        name: z.string(),
        direction: z.enum(["long", "short", "none"]),
        condition: z.string(),
        entryLevelIds: z.array(z.string()),
        stopLevelId: z.string().nullable(),
        targetLevelIds: z.array(z.string()),
        invalidation: z.string(),
      }),
    )
    .max(4),
});

export const riskOutputSchema = z.object({
  observed: z.array(z.string()),
  dataGaps: z.array(z.string()),
  assumed: z.array(z.string()),
  summary: z.string(),
});

export const intentOutputSchema = z.object({
  kind: runKindSchema.exclude(["undetermined"]),
  symbol: z.string().nullable(),
  horizon: horizonSchema.nullable(),
  hypothesis: z.string().nullable(),
  clarification: z.string().nullable(),
});
export type IntentOutput = z.infer<typeof intentOutputSchema>;

/* ---------------------------------- 结构化报告 ---------------------------------- */

export const scenarioSchema = z.object({
  name: z.string(),
  direction: z.enum(["long", "short", "none"]),
  condition: z.string(),
  entryZone: z.object({ low: num, high: num }).nullable(),
  stopRef: numOrNull,
  targets: z.array(num).nullable(),
  invalidation: z.string(),
  evidenceIds: z.array(z.string()),
});

export const analysisReportSchema = z.object({
  schemaVersion: z.literal(1),
  symbol: z.string(),
  exchange: z.literal("binance"),
  marketType: z.literal("spot"),
  dataCutoff: z.string(),
  snapshotId: z.string(),
  intervals: z.array(klineIntervalSchema),
  horizon: horizonSchema,
  dataQuality: dataQualitySchema,
  regime: regimeSchema,
  indicators: z.array(indicatorSetSchema),
  levels: z.object({ support: z.array(levelSchema), resistance: z.array(levelSchema) }),
  alignment: alignmentSchema,
  technical: technicalAnalystOutputSchema.nullable(),
  regimeView: regimeAgentOutputSchema.nullable(),
  bull: researchOutputSchema.nullable(),
  bear: researchOutputSchema.nullable(),
  synthesis: synthesisOutputSchema,
  scenarios: z.array(scenarioSchema),
  risks: riskOutputSchema,
  prediction: predictionResultSchema,
  targetRange: z
    .object({
      low: z.string(),
      high: z.string(),
      relation: z.enum(["inside", "below", "above", "straddles"]),
      note: z.string(),
    })
    .nullable(),
  unsupported: z.array(z.string()),
  evidence: z.array(evidenceSchema),
  sources: z.array(z.object({ id: z.string(), kind: z.enum(["binance_klines", "indicator", "level", "regime"]), label: z.string() })),
  summary: z.string(),
  modelInfo: z.object({ provider: z.string(), analystModel: z.string(), synthModel: z.string(), promptVersion: z.string() }),
  createdAt: z.string(),
});
export type AnalysisReport = z.infer<typeof analysisReportSchema>;
export type ReportSummaryLike = AnalysisReport;

/* ---------------------------------- UI data parts ---------------------------------- */

export const runDataSchema = z.object({
  runId: z.string(),
  status: runStatusSchema,
  kind: runKindSchema,
  symbol: z.string().nullable(),
  intervals: z.array(klineIntervalSchema),
  horizon: horizonSchema.nullable(),
  attempt: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: runErrorSchema.nullable(),
});
export type RunData = z.infer<typeof runDataSchema>;

export const stepDataSchema = z.object({
  stepId: z.string(),
  order: z.number().int(),
  name: z.string(),
  status: stepStatusSchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  summary: z.string().nullable(),
  error: runErrorSchema.nullable(),
  evidenceIds: z.array(z.string()),
});
export type StepData = z.infer<typeof stepDataSchema>;

export const toolDataSchema = z.object({
  toolId: z.string(),
  name: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  input: z.unknown(),
  output: z.unknown().optional(),
  error: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
});
export type ToolData = z.infer<typeof toolDataSchema>;

export const noticeDataSchema = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
});
export type NoticeData = z.infer<typeof noticeDataSchema>;

export type AgentDataParts = {
  run: RunData;
  step: StepData;
  snapshot: SnapshotMeta;
  tool: ToolData;
  report: AnalysisReport;
  notice: NoticeData;
  error: RunError;
};

export const agentMetadataSchema = z.object({
  runId: z.string().nullable(),
  kind: runKindSchema.nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable().optional(),
  status: messageStatusSchema.optional(),
});
export type AgentMetadata = z.infer<typeof agentMetadataSchema>;

export type AgentUIMessage = UIMessage<AgentMetadata, AgentDataParts>;

/** 数据库中 parts 的校验（松散：未知 part 类型保留原样） */
const textPartSchema = z.object({ type: z.literal("text"), text: z.string(), state: z.enum(["streaming", "done"]).optional() });
const dataPartSchemas = [
  z.object({ type: z.literal("data-run"), id: z.string().optional(), data: runDataSchema }),
  z.object({ type: z.literal("data-step"), id: z.string().optional(), data: stepDataSchema }),
  z.object({ type: z.literal("data-snapshot"), id: z.string().optional(), data: snapshotMetaSchema }),
  z.object({ type: z.literal("data-tool"), id: z.string().optional(), data: toolDataSchema }),
  z.object({ type: z.literal("data-report"), id: z.string().optional(), data: analysisReportSchema }),
  z.object({ type: z.literal("data-error"), id: z.string().optional(), data: runErrorSchema }),
] as const;
export const uiPartSchema = z.union([textPartSchema, ...dataPartSchemas, z.object({ type: z.string() }).loose()]);
export const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  metadata: agentMetadataSchema.optional(),
  parts: z.array(uiPartSchema),
});

/* ---------------------------------- API 契约 ---------------------------------- */

export const createConversationBodySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("favorite_card"),
    symbol: z.string().min(2).max(24),
    launchId: z.uuid(),
  }),
  z.object({
    source: z.literal("manual"),
    text: z.string().min(1).max(20_000),
    launchId: z.uuid(),
  }),
]);
export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;

export const createConversationResponseSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  created: z.boolean(),
});
export type CreateConversationResponse = z.infer<typeof createConversationResponseSchema>;

export const runSummarySchema = z.object({
  runId: z.string(),
  status: runStatusSchema,
  kind: runKindSchema,
  attempt: z.number().int(),
  symbol: z.string().nullable(),
  intervals: z.array(klineIntervalSchema),
  horizon: horizonSchema.nullable(),
  messageId: z.string(),
  assistantMessageId: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
  error: runErrorSchema.nullable(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const conversationViewSchema = z.object({
  conversation: z.object({
    id: z.string(),
    title: z.string().nullable(),
    source: z.enum(["favorite_card", "manual"]),
    currentSymbol: z.string().nullable(),
    currentIntervals: z.array(klineIntervalSchema),
    currentHorizon: horizonSchema.nullable(),
    currentReportId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  messages: z.array(uiMessageSchema),
  activeRun: runSummarySchema.nullable(),
  pendingMessageId: z.string().nullable(),
  retryableMessageId: z.string().nullable(),
  currentReport: analysisReportSchema.nullable(),
});
export type ConversationView = Omit<z.infer<typeof conversationViewSchema>, "messages"> & { messages: AgentUIMessage[] };

export const chatBodySchema = z.union([
  z.object({ conversationId: z.string(), pendingMessageId: z.string() }),
  z.object({ conversationId: z.string(), message: uiMessageSchema }),
]);
export type ChatBody = z.infer<typeof chatBodySchema>;

export const runDetailSchema = z.object({
  run: runSummarySchema,
  steps: z.array(stepDataSchema),
  report: analysisReportSchema.nullable(),
  assistantMessage: uiMessageSchema.nullable(),
  userMessageStatus: messageStatusSchema.nullable(),
});
export type RunDetail = Omit<z.infer<typeof runDetailSchema>, "assistantMessage"> & { assistantMessage: AgentUIMessage | null };

/** 客户端解析错误响应用的宽松类型 */
export type ApiErrorBodyLike = { error?: { kind?: import("@/lib/types").ApiErrorKind; message?: string; retryAfterSec?: number; details?: Record<string, unknown> } };

export const cancelResponseSchema = z.object({ runId: z.string(), status: runStatusSchema });
export type CancelResponse = z.infer<typeof cancelResponseSchema>;

/* ---------------------------------- 常量 ---------------------------------- */

export const UNSUPPORTED_DATA_SOURCES = ["news", "sentiment", "onchain", "funding_rate", "open_interest"] as const;

export const HORIZON_LABEL: Record<Horizon, string> = {
  "4h": "未来 4 小时",
  "12h": "未来 12 小时",
  "24h": "未来 24 小时",
  "3d": "未来 3 天",
  "7d": "未来 7 天",
};

export function horizonToMs(h: Horizon): number {
  const table: Record<Horizon, number> = {
    "4h": 4 * 3_600_000,
    "12h": 12 * 3_600_000,
    "24h": 24 * 3_600_000,
    "3d": 3 * 86_400_000,
    "7d": 7 * 86_400_000,
  };
  return table[h];
}
