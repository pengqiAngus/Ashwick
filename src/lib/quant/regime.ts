/**
 * 市场状态判定（确定性规则）与多周期一致性。
 */
import type { KlineInterval } from "@/lib/types";
import type { Regime } from "@/lib/agent/schemas";
import type { AnalysisCandle } from "@/lib/market/ohlcv";
import { bollinger, ema } from "@/lib/quant/indicators";

export const REGIME_VERSION = "rg-1.0.0";

export interface IntervalRegime {
  interval: KlineInterval;
  trend: "up" | "down" | "flat";
  volatility: "low" | "normal" | "high";
  emaStack: "bullish" | "bearish" | "mixed";
  emaSlopePct: number | null;
  bbWidthPercentile: number | null;
}

function percentileRank(values: number[], x: number): number {
  if (values.length === 0) return 0.5;
  let below = 0;
  for (const v of values) if (v < x) below++;
  return below / values.length;
}

export function intervalRegime(candles: AnalysisCandle[], interval: KlineInterval, opts: { slopeBars?: number; slopeFlatPct?: number } = {}): IntervalRegime {
  const close = candles.map((c) => c.close);
  const e20 = ema(close, 20);
  const e50 = ema(close, 50);
  const e200 = ema(close, 200);
  const bb = bollinger(close, 20, 2);
  const n = close.length - 1;
  const slopeBars = opts.slopeBars ?? 10;
  const flatPct = opts.slopeFlatPct ?? 0.005;

  const a = e50[n];
  const b = n - slopeBars >= 0 ? e50[n - slopeBars] : null;
  const emaSlopePct = a != null && b != null && b !== 0 ? a / b - 1 : null;

  let emaStack: IntervalRegime["emaStack"] = "mixed";
  if (e20[n] != null && e50[n] != null && e200[n] != null) {
    const x = e20[n] as number;
    const y = e50[n] as number;
    const z = e200[n] as number;
    if (x > y && y > z) emaStack = "bullish";
    else if (x < y && y < z) emaStack = "bearish";
  } else if (e20[n] != null && e50[n] != null) {
    emaStack = (e20[n] as number) > (e50[n] as number) ? "bullish" : "bearish";
  }

  let trend: IntervalRegime["trend"] = "flat";
  if (emaSlopePct != null) {
    if (emaSlopePct > flatPct && emaStack !== "bearish") trend = "up";
    else if (emaSlopePct < -flatPct && emaStack !== "bullish") trend = "down";
  }

  const widths = bb.widthPct.filter((w): w is number => w != null).slice(-100);
  const wLast = bb.widthPct[n];
  const bbWidthPercentile = wLast != null ? percentileRank(widths, wLast) : null;
  let volatility: IntervalRegime["volatility"] = "normal";
  if (bbWidthPercentile != null) {
    if (bbWidthPercentile >= 0.8) volatility = "high";
    else if (bbWidthPercentile <= 0.2) volatility = "low";
  }
  return { interval, trend, volatility, emaStack, emaSlopePct, bbWidthPercentile };
}

const WEIGHT: Record<KlineInterval, number> = { "15m": 0.5, "1h": 1, "4h": 1.5, "1d": 2, "1w": 2.5 };

export function alignment(parts: IntervalRegime[]): { score: number; agree: boolean; detail: string } {
  if (parts.length === 0) return { score: 0, agree: false, detail: "无周期数据" };
  let num = 0;
  let den = 0;
  for (const p of parts) {
    const t = p.trend === "up" ? 1 : p.trend === "down" ? -1 : 0;
    num += WEIGHT[p.interval] * t;
    den += WEIGHT[p.interval];
  }
  const score = den === 0 ? 0 : num / den;
  const dirs = parts.map((p) => p.trend).filter((t) => t !== "flat");
  const agree = dirs.length === parts.length && dirs.every((d) => d === dirs[0]);
  const detail = parts.map((p) => `${p.interval}:${p.trend}`).join(", ");
  return { score, agree, detail };
}

export function overallRegime(parts: IntervalRegime[]): Regime {
  const al = alignment(parts);
  const highVol = parts.filter((p) => p.volatility === "high").length;
  const evidence: string[] = parts.map(
    (p) =>
      `${p.interval}：EMA 排列 ${p.emaStack}，EMA50 斜率 ${p.emaSlopePct == null ? "n/a" : (p.emaSlopePct * 100).toFixed(2) + "%"}，布林带宽分位 ${
        p.bbWidthPercentile == null ? "n/a" : Math.round(p.bbWidthPercentile * 100)
      }`,
  );
  let label: Regime["label"] = "unclear";
  if (al.agree && al.score > 0) label = "trending_up";
  else if (al.agree && al.score < 0) label = "trending_down";
  else if (highVol >= Math.ceil(parts.length / 2)) label = "volatile";
  else if (parts.every((p) => p.trend === "flat")) label = "ranging";
  else if (Math.abs(al.score) >= 0.5) label = al.score > 0 ? "trending_up" : "trending_down";
  else if (parts.filter((p) => p.trend === "flat").length >= Math.ceil(parts.length / 2)) label = "ranging";
  return { label, byInterval: parts, evidence, version: REGIME_VERSION };
}
