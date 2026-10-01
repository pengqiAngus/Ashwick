/**
 * 追问意图路由：规则优先，规则无法判定时才调用模型。
 * 该文件的规则部分不依赖服务端模块，便于测试。
 */
import { HORIZONS, type Horizon, type RunConfig, type RunKind } from "@/lib/agent/schemas";

export interface IntentContext {
  currentSymbol: string | null;
  currentHorizon: Horizon | null;
  hasReport: boolean;
}

export interface RuleIntent {
  kind: Exclude<RunKind, "undetermined"> | null;
  symbol: string | null;
  horizon: Horizon | null;
  hypothesis: string | null;
  /** 规则是否足够确定；false 时需要模型判定 */
  confident: boolean;
}

const STOP_WORDS = new Set([
  "USDT", "BTC", // BTC 单独处理：它也是资产
  "EMA", "RSI", "MACD", "ATR", "BB", "K", "AI", "OK", "USD", "ETF", "CPI", "FED", "API", "OI", "PA", "TA",
]);
const ASSET_RE = /\b([A-Z]{2,10})(?:USDT)?\b/g;

/** 从文本中提取可能的资产代码（大写字母，不含指标缩写） */
export function extractSymbols(text: string): string[] {
  const upper = text.toUpperCase();
  const out: string[] = [];
  for (const m of upper.matchAll(ASSET_RE)) {
    const base = m[1];
    if (STOP_WORDS.has(base) && base !== "BTC") continue;
    const sym = base.endsWith("USDT") ? base : `${base}USDT`;
    if (!out.includes(sym)) out.push(sym);
  }
  return out;
}

const HORIZON_RE = /(\d+)\s*(小时|个小时|h|H|天|日|d|D)/;

export function extractHorizon(text: string): Horizon | null {
  const m = text.match(HORIZON_RE);
  if (!m) {
    if (/一天|一日|明天/.test(text)) return "24h";
    if (/一周|一星期|七天/.test(text)) return "7d";
    if (/半天/.test(text)) return "12h";
    return null;
  }
  const n = Number(m[1]);
  const unit = m[2];
  const hours = /小时|h|H/.test(unit) ? n : n * 24;
  const table: Array<[Horizon, number]> = [["4h", 4], ["12h", 12], ["24h", 24], ["3d", 72], ["7d", 168]];
  let best: Horizon = HORIZONS[0];
  let bestDiff = Infinity;
  for (const [h, hh] of table) {
    const d = Math.abs(hh - hours);
    if (d < bestDiff) {
      bestDiff = d;
      best = h;
    }
  }
  return best;
}

const REFRESH_RE = /刷新|重新获取|更新(一下)?数据|最新数据|重新分析|再跑一次|重跑|再分析一次|重新看/;
const EXPLAIN_RE = /为什么|为何|怎么算|如何算|怎么得出|如何得出|依据|解释|什么意思|怎么理解|哪来|从何|怎么看出|凭什么|理由/;
const HYPO_RE = /如果|假如|假设|万一|要是|一旦/;
const ANALYZE_RE = /分析|看看|看一下|预测|走势|判断|研究|怎么样|如何/;
const SWITCH_RE = /换成|换到|改成|切换|换一个|再分析|看看|分析一下|分析/;

export function ruleIntent(text: string, ctx: IntentContext): RuleIntent {
  const t = text.trim();
  const symbols = extractSymbols(t);
  const horizon = extractHorizon(t);
  const mentionsOther = symbols.find((s) => s !== ctx.currentSymbol) ?? null;

  // 首次分析（无报告）
  if (!ctx.hasReport) {
    const symbol = symbols[0] ?? ctx.currentSymbol;
    if (!symbol) return { kind: "clarify", symbol: null, horizon, hypothesis: null, confident: /分析|走势|预测/.test(t) };
    return { kind: "full_analysis", symbol, horizon, hypothesis: null, confident: true };
  }
  // 切换交易对：提到不同资产且有分析类动词
  if (mentionsOther && (SWITCH_RE.test(t) || ANALYZE_RE.test(t))) {
    return { kind: "switch_symbol", symbol: mentionsOther, horizon, hypothesis: null, confident: true };
  }
  // 改变周期优先于刷新：“换成 4 小时再分析一次”
  if (horizon && horizon !== ctx.currentHorizon && !EXPLAIN_RE.test(t) && !HYPO_RE.test(t)) {
    return { kind: "change_horizon", symbol: ctx.currentSymbol, horizon, hypothesis: null, confident: true };
  }
  if (REFRESH_RE.test(t)) {
    return { kind: "refresh", symbol: ctx.currentSymbol, horizon: horizon ?? ctx.currentHorizon, hypothesis: null, confident: true };
  }
  if (HYPO_RE.test(t)) {
    return { kind: "hypothetical", symbol: ctx.currentSymbol, horizon: ctx.currentHorizon, hypothesis: t, confident: true };
  }
  if (EXPLAIN_RE.test(t)) {
    return { kind: "followup_explain", symbol: ctx.currentSymbol, horizon: ctx.currentHorizon, hypothesis: null, confident: true };
  }
  // 有报告但意图模糊：默认解释，标记为不确定，交给模型
  return { kind: "followup_explain", symbol: ctx.currentSymbol, horizon: ctx.currentHorizon, hypothesis: null, confident: false };
}

/** 依据意图与会话上下文推导新的运行配置（继承规则） */
export function applyIntent(
  base: RunConfig,
  intent: { kind: Exclude<RunKind, "undetermined">; symbol: string | null; horizon: Horizon | null; hypothesis: string | null },
  currentReportId: string | null,
): RunConfig {
  switch (intent.kind) {
    case "switch_symbol":
      return { ...base, symbol: intent.symbol ?? base.symbol, horizon: intent.horizon ?? base.horizon, targetRange: null, baseReportId: null, hypothesis: null };
    case "change_horizon":
      return { ...base, horizon: intent.horizon ?? base.horizon, baseReportId: null, hypothesis: null };
    case "refresh":
    case "full_analysis":
      return { ...base, symbol: intent.symbol ?? base.symbol, horizon: intent.horizon ?? base.horizon, baseReportId: null, hypothesis: null };
    case "hypothetical":
      return { ...base, baseReportId: currentReportId, hypothesis: intent.hypothesis ?? base.question };
    case "followup_explain":
      return { ...base, baseReportId: currentReportId, hypothesis: null };
    case "clarify":
      return { ...base, baseReportId: currentReportId, hypothesis: null };
  }
}

export const FULL_PIPELINE_KINDS: RunKind[] = ["full_analysis", "refresh", "change_horizon", "switch_symbol"];
