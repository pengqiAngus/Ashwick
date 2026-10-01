/**
 * 技术指标：纯函数，输入 number[]，输出与输入等长的 (number|null)[]（预热期为 null）。
 * 所有输入都必须是有限数；否则抛错，由调用方在数据检查阶段拦截。
 */
import type { KlineInterval } from "@/lib/types";
import type { IndicatorSet } from "@/lib/agent/schemas";
import type { AnalysisCandle } from "@/lib/market/ohlcv";

export const INDICATORS_VERSION = "ind-1.0.0";

export type Series = Array<number | null>;

export function assertFinite(values: number[], name = "series"): void {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) throw new Error(`${name}[${i}] 不是有限数`);
  }
}

export function sma(values: number[], period: number): Series {
  assertFinite(values);
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA：以前 period 根 SMA 作为种子 */
export function ema(values: number[], period: number): Series {
  assertFinite(values);
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI（Wilder 平滑） */
export function rsi(values: number[], period = 14): Series {
  assertFinite(values);
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): { macd: Series; signal: Series; histogram: Series } {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line: Series = values.map((_, i) => (fastE[i] != null && slowE[i] != null ? (fastE[i] as number) - (slowE[i] as number) : null));
  // signal 在 macd 线有值的区间上计算 EMA
  const start = line.findIndex((v) => v != null);
  const signal: Series = new Array(values.length).fill(null);
  const histogram: Series = new Array(values.length).fill(null);
  if (start >= 0) {
    const sub = line.slice(start) as number[];
    const sig = ema(sub, signalPeriod);
    for (let i = 0; i < sub.length; i++) {
      if (sig[i] != null) {
        signal[start + i] = sig[i];
        histogram[start + i] = sub[i] - (sig[i] as number);
      }
    }
  }
  return { macd: line, signal, histogram };
}

export function trueRange(high: number[], low: number[], close: number[]): number[] {
  assertFinite(high, "high");
  assertFinite(low, "low");
  assertFinite(close, "close");
  const out: number[] = [];
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      out.push(high[i] - low[i]);
      continue;
    }
    out.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
  }
  return out;
}

/** ATR（Wilder 平滑） */
export function atr(high: number[], low: number[], close: number[], period = 14): Series {
  const tr = trueRange(high, low, close);
  const out: Series = new Array(close.length).fill(null);
  if (tr.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function stddev(values: number[], period: number): Series {
  assertFinite(values);
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(v / period);
  }
  return out;
}

export function bollinger(values: number[], period = 20, mult = 2): { middle: Series; upper: Series; lower: Series; widthPct: Series } {
  const middle = sma(values, period);
  const sd = stddev(values, period);
  const upper: Series = [];
  const lower: Series = [];
  const widthPct: Series = [];
  for (let i = 0; i < values.length; i++) {
    if (middle[i] == null || sd[i] == null) {
      upper.push(null);
      lower.push(null);
      widthPct.push(null);
      continue;
    }
    const m = middle[i] as number;
    const s = sd[i] as number;
    upper.push(m + mult * s);
    lower.push(m - mult * s);
    widthPct.push(m === 0 ? null : (2 * mult * s) / m);
  }
  return { middle, upper, lower, widthPct };
}

export function logReturns(values: number[]): number[] {
  assertFinite(values);
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] <= 0 || values[i] <= 0) throw new Error("价格必须为正");
    out.push(Math.log(values[i] / values[i - 1]));
  }
  return out;
}

/** 近 period 根对数收益率的样本标准差 */
export function realizedVol(values: number[], period = 20): number | null {
  if (values.length < period + 1) return null;
  const r = logReturns(values.slice(-(period + 1)));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v);
}

export function simpleReturn(values: number[], lookback: number): number | null {
  if (values.length <= lookback) return null;
  const a = values[values.length - 1 - lookback];
  const b = values[values.length - 1];
  return a === 0 ? null : b / a - 1;
}

export function volumeChange(volumes: number[], period = 20): number | null {
  if (volumes.length < period + 1) return null;
  const recent = volumes.slice(-(period + 1), -1);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (avg === 0) return null;
  return volumes[volumes.length - 1] / avg - 1;
}

const last = (s: Series): number | null => (s.length ? s[s.length - 1] : null);

export const INDICATOR_PARAMS = { ema: [20, 50, 200], rsi: 14, macd: [12, 26, 9], atr: 14, bb: [20, 2], vol: 20 } as const;

/** 对一段已收盘 K 线计算完整指标集 */
export function computeIndicatorSet(candles: AnalysisCandle[], interval: KlineInterval): IndicatorSet {
  if (candles.length === 0) throw new Error("没有可用 K 线");
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const vol = candles.map((c) => c.baseVolume);
  const lastClose = close[close.length - 1];
  const m = macd(close, 12, 26, 9);
  const bb = bollinger(close, 20, 2);
  const atr14 = last(atr(high, low, close, 14));
  const bbM = last(bb.middle);
  const bbU = last(bb.upper);
  const bbL = last(bb.lower);
  const bbW = last(bb.widthPct);
  const mac = last(m.macd);
  const sig = last(m.signal);
  const hist = last(m.histogram);
  return {
    interval,
    barsUsed: candles.length,
    lastClose,
    lastCloseTime: candles[candles.length - 1].closeTime,
    ema20: last(ema(close, 20)),
    ema50: last(ema(close, 50)),
    ema200: last(ema(close, 200)),
    rsi14: last(rsi(close, 14)),
    macd: mac != null && sig != null && hist != null ? { macd: mac, signal: sig, histogram: hist } : null,
    atr14,
    atrPct: atr14 != null && lastClose > 0 ? atr14 / lastClose : null,
    bb:
      bbM != null && bbU != null && bbL != null && bbW != null
        ? { middle: bbM, upper: bbU, lower: bbL, widthPct: bbW, percentB: bbU === bbL ? 0.5 : (lastClose - bbL) / (bbU - bbL) }
        : null,
    returns: { r1: simpleReturn(close, 1), r5: simpleReturn(close, 5), r20: simpleReturn(close, 20) },
    realizedVol20: realizedVol(close, 20),
    volumeChange20: volumeChange(vol, 20),
    params: { ema20: 20, ema50: 50, ema200: 200, rsi: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, atr: 14, bbPeriod: 20, bbMult: 2, vol: 20 },
    version: INDICATORS_VERSION,
  };
}
