/**
 * 支撑 / 阻力：摆动高低点（分形）+ 按 ATR 比例带宽聚类。
 * 每个价位都带有形成它的 K 线时间，便于在报告中引用。
 */
import type { KlineInterval } from "@/lib/types";
import type { Level } from "@/lib/agent/schemas";
import type { AnalysisCandle } from "@/lib/market/ohlcv";
import { atr } from "@/lib/quant/indicators";

export const LEVELS_VERSION = "lv-1.0.0";

export interface SwingPoint {
  price: number;
  openTime: number;
  kind: "high" | "low";
}

/** 左右各 k 根内的极值即为摆动点 */
export function findSwings(candles: AnalysisCandle[], k = 3): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ price: candles[i].high, openTime: candles[i].openTime, kind: "high" });
    if (isLow) out.push({ price: candles[i].low, openTime: candles[i].openTime, kind: "low" });
  }
  return out;
}

interface Cluster {
  prices: number[];
  times: number[];
}

/** 按价格排序后，相邻价差 <= tolerance 的归为一簇 */
export function clusterPrices(points: SwingPoint[], tolerance: number): Cluster[] {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters: Cluster[] = [];
  for (const p of sorted) {
    const cur = clusters[clusters.length - 1];
    if (cur && p.price - cur.prices[cur.prices.length - 1] <= tolerance) {
      cur.prices.push(p.price);
      cur.times.push(p.openTime);
    } else {
      clusters.push({ prices: [p.price], times: [p.openTime] });
    }
  }
  return clusters;
}

export interface LevelOptions {
  swingK?: number;
  /** 聚类带宽 = atrMult × ATR14（ATR 不可用时退回 0.3% 价格） */
  atrMult?: number;
  /** 只看最近多少根 K 线 */
  lookback?: number;
  /** 每侧最多返回几个 */
  perSide?: number;
}

export function computeLevels(candles: AnalysisCandle[], interval: KlineInterval, opts: LevelOptions = {}): Level[] {
  const k = opts.swingK ?? 3;
  const lookback = opts.lookback ?? 240;
  const perSide = opts.perSide ?? 3;
  const win = candles.slice(-lookback);
  if (win.length < 2 * k + 1) return [];
  const lastClose = win[win.length - 1].close;
  const atrLast = atr(
    win.map((c) => c.high),
    win.map((c) => c.low),
    win.map((c) => c.close),
    14,
  ).at(-1);
  const tolerance = atrLast != null ? (opts.atrMult ?? 0.5) * atrLast : lastClose * 0.003;
  const swings = findSwings(win, k);
  const clusters = clusterPrices(swings, tolerance);
  const levels: Level[] = clusters.map((cl, idx) => {
    const price = cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length;
    const side: Level["side"] = price <= lastClose ? "support" : "resistance";
    return {
      id: `lv:${interval}:${idx}`,
      side,
      price,
      method: cl.prices.length > 1 ? "cluster" : "swing",
      touches: cl.prices.length,
      interval,
      sourceBarTimes: [...cl.times].sort((a, b) => a - b),
      distancePct: lastClose === 0 ? 0 : (price - lastClose) / lastClose,
    };
  });
  const pick = (side: Level["side"]) =>
    levels
      .filter((l) => l.side === side)
      // 优先离价格近；触碰次数多的略优先
      .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct) || b.touches - a.touches)
      .slice(0, perSide);
  return [...pick("support"), ...pick("resistance")].map((l, i) => ({ ...l, id: `lv:${interval}:${i}` }));
}

/** 多周期价位合并：跨周期价差在 tolerancePct 内的只保留触碰更多的那一个 */
export function mergeLevels(all: Level[], tolerancePct = 0.004, perSide = 5): Level[] {
  const merged: Level[] = [];
  for (const l of [...all].sort((a, b) => b.touches - a.touches)) {
    const dup = merged.find((m) => m.side === l.side && Math.abs(m.price - l.price) / l.price <= tolerancePct);
    if (!dup) merged.push(l);
  }
  const pick = (side: Level["side"]) =>
    merged
      .filter((l) => l.side === side)
      .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))
      .slice(0, perSide);
  return [...pick("support"), ...pick("resistance")];
}
