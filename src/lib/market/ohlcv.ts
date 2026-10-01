/**
 * 面向分析的 OHLCV 数据：完整字段、只含已收盘 K 线、按时间范围分页获取。
 * 图表用的 Candle（仅 OHLC）继续由 binance/klines.ts 提供，两者不混用。
 */
import { fetchRawKlines } from "@/lib/binance/klines";
import type { BinanceKlineTuple } from "@/lib/binance/types";
import type { KlineInterval } from "@/lib/types";

export interface AnalysisCandle {
  exchange: "binance";
  marketType: "spot";
  symbol: string;
  interval: KlineInterval;
  /** 毫秒 */
  openTime: number;
  /** 毫秒（币安 closeTime 为区间末毫秒，如 …:59.999） */
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 基础资产成交量 */
  baseVolume: number;
  /** 报价资产成交量 */
  quoteVolume: number;
  trades: number;
  /** 服务端拿到数据的时间（毫秒） */
  fetchedAt: number;
  isClosed: boolean;
}

export const INTERVAL_MS: Record<KlineInterval, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

export interface NormalizeStats {
  invalidRemoved: number;
  duplicatesRemoved: number;
  openRemoved: number;
}

function toFinite(raw: unknown): number | null {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toFinitePositive(raw: unknown): number | null {
  const n = toFinite(raw);
  return n != null && n > 0 ? n : null;
}

/**
 * 原始元组 → AnalysisCandle：
 * - 校验数值有限、OHLC 关系合法
 * - 只保留 closeTime <= cutoff 的 K 线（严格“已收盘”）
 * - 同一 openTime 只保留最后一条，按时间升序
 */
export function normalizeAnalysisCandles(
  raw: unknown,
  ctx: { symbol: string; interval: KlineInterval; cutoff: number; fetchedAt: number },
): { candles: AnalysisCandle[]; stats: NormalizeStats } {
  const stats: NormalizeStats = { invalidRemoved: 0, duplicatesRemoved: 0, openRemoved: 0 };
  if (!Array.isArray(raw)) return { candles: [], stats };
  const byOpen = new Map<number, AnalysisCandle>();
  for (const row of raw as unknown[]) {
    if (!Array.isArray(row) || row.length < 9) {
      stats.invalidRemoved++;
      continue;
    }
    const r = row as BinanceKlineTuple;
    const openTime = toFinite(r[0]);
    const closeTime = toFinite(r[6]);
    const open = toFinitePositive(r[1]);
    const high = toFinitePositive(r[2]);
    const low = toFinitePositive(r[3]);
    const close = toFinitePositive(r[4]);
    const baseVolume = toFinite(r[5]);
    const quoteVolume = toFinite(r[7]);
    const trades = toFinite(r[8]);
    if (
      openTime == null ||
      closeTime == null ||
      openTime < 0 ||
      closeTime <= openTime ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      baseVolume == null ||
      baseVolume < 0 ||
      quoteVolume == null ||
      quoteVolume < 0 ||
      trades == null ||
      trades < 0
    ) {
      stats.invalidRemoved++;
      continue;
    }
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) {
      stats.invalidRemoved++;
      continue;
    }
    if (closeTime > ctx.cutoff) {
      stats.openRemoved++;
      continue;
    }
    if (byOpen.has(openTime)) stats.duplicatesRemoved++;
    byOpen.set(openTime, {
      exchange: "binance",
      marketType: "spot",
      symbol: ctx.symbol,
      interval: ctx.interval,
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      baseVolume,
      quoteVolume,
      trades: Math.floor(trades),
      fetchedAt: ctx.fetchedAt,
      isClosed: true,
    });
  }
  const candles = [...byOpen.values()].sort((a, b) => a.openTime - b.openTime);
  return { candles, stats };
}

/** 合并多页结果：按 openTime 去重、升序 */
export function mergeCandles(pages: AnalysisCandle[][]): { candles: AnalysisCandle[]; duplicatesRemoved: number } {
  const byOpen = new Map<number, AnalysisCandle>();
  let duplicatesRemoved = 0;
  for (const page of pages) {
    for (const c of page) {
      if (byOpen.has(c.openTime)) duplicatesRemoved++;
      byOpen.set(c.openTime, c);
    }
  }
  return { candles: [...byOpen.values()].sort((a, b) => a.openTime - b.openTime), duplicatesRemoved };
}

/** 统计相邻 K 线之间的缺口数量（openTime 差不是恰好一个周期） */
export function countGaps(candles: AnalysisCandle[], interval: KlineInterval): number {
  const step = INTERVAL_MS[interval];
  let gaps = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].openTime - candles[i - 1].openTime !== step) gaps++;
  }
  return gaps;
}

export interface FetchClosedOptions {
  /** 只保留 closeTime <= cutoff 的 K 线；默认 Date.now() */
  cutoff?: number;
  /** 需要的最少已收盘根数（含指标预热） */
  minBars: number;
  /** 最多翻页次数，防止无限拉取 */
  maxPages?: number;
  signal?: AbortSignal;
  /** 依赖注入，便于测试 */
  fetcher?: typeof fetchRawKlines;
  now?: () => number;
}

export interface FetchClosedResult {
  candles: AnalysisCandle[];
  stats: NormalizeStats & { pages: number };
  cutoff: number;
  fetchedAt: number;
}

/**
 * 向前分页拉取 symbol/interval 在 cutoff 之前已收盘的 K 线，直到达到 minBars 或历史耗尽。
 */
export async function fetchClosedKlines(symbol: string, interval: KlineInterval, opts: FetchClosedOptions): Promise<FetchClosedResult> {
  const now = opts.now ?? Date.now;
  const fetcher = opts.fetcher ?? fetchRawKlines;
  const fetchedAt = now();
  const cutoff = opts.cutoff ?? fetchedAt;
  const maxPages = opts.maxPages ?? 6;
  const stats = { invalidRemoved: 0, duplicatesRemoved: 0, openRemoved: 0, pages: 0 };
  const pages: AnalysisCandle[][] = [];
  // 币安按 openTime 过滤：只请求 openTime <= cutoff - 1 的 K 线；未收盘的再由 closeTime 过滤
  let endTime = cutoff - 1;
  let total = 0;
  while (stats.pages < maxPages && total < opts.minBars) {
    opts.signal?.throwIfAborted();
    const raw = await fetcher(symbol, interval, { endTime, limit: 1000, signal: opts.signal });
    stats.pages++;
    if (raw.length === 0) break;
    const { candles, stats: s } = normalizeAnalysisCandles(raw, { symbol, interval, cutoff, fetchedAt });
    stats.invalidRemoved += s.invalidRemoved;
    stats.duplicatesRemoved += s.duplicatesRemoved;
    stats.openRemoved += s.openRemoved;
    const earliestRaw = Math.min(...raw.map((r) => Number(r[0])).filter((n) => Number.isFinite(n)));
    pages.push(candles);
    total += candles.length;
    if (!Number.isFinite(earliestRaw) || raw.length < 1000) break; // 历史耗尽
    endTime = earliestRaw - 1;
  }
  const merged = mergeCandles(pages);
  stats.duplicatesRemoved += merged.duplicatesRemoved;
  return { candles: merged.candles, stats, cutoff, fetchedAt };
}
