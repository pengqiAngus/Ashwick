import { binanceGet } from "@/lib/binance/client";
import type { BinanceKlineTuple } from "@/lib/binance/types";
import type { Candle, KlineInterval } from "@/lib/types";

export const KLINES_DEFAULT_LIMIT = 500;
export const KLINES_MAX_LIMIT = 1000;

function toFinitePositive(raw: unknown): number | null {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 把币安 K 线数组转换为图表用的蜡烛：
 * - 毫秒 openTime → 秒
 * - OHLC 转数字并校验（有限、>0、low ≤ min(open,close)、high ≥ max(open,close)）
 * - 按时间升序、同一时间只保留最后一条
 */
export function normalizeKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const byTime = new Map<number, Candle>();
  for (const row of raw as unknown[]) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const r = row as BinanceKlineTuple;
    const openTime = Number(r[0]);
    if (!Number.isFinite(openTime) || openTime <= 0) continue;
    const open = toFinitePositive(r[1]);
    const high = toFinitePositive(r[2]);
    const low = toFinitePositive(r[3]);
    const close = toFinitePositive(r[4]);
    if (open == null || high == null || low == null || close == null) continue;
    if (low > Math.min(open, close) || high < Math.max(open, close)) continue;
    const time = Math.floor(openTime / 1000);
    byTime.set(time, { time, open, high, low, close });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export async function getKlines(symbol: string, interval: KlineInterval, limit = KLINES_DEFAULT_LIMIT): Promise<Candle[]> {
  const safeLimit = Math.max(1, Math.min(KLINES_MAX_LIMIT, Math.floor(limit)));
  const raw = await binanceGet<BinanceKlineTuple[]>("api/v3/klines", {
    symbol,
    interval,
    limit: String(safeLimit),
  });
  return normalizeKlines(raw);
}

/**
 * 按时间范围获取原始 K 线元组（供分析快照分页使用）。
 * 币安按 openTime ∈ [startTime, endTime] 过滤，单次最多 1000 根。
 */
export async function fetchRawKlines(
  symbol: string,
  interval: KlineInterval,
  opts: { startTime?: number; endTime?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<BinanceKlineTuple[]> {
  const safeLimit = Math.max(1, Math.min(KLINES_MAX_LIMIT, Math.floor(opts.limit ?? KLINES_MAX_LIMIT)));
  const params: Record<string, string> = { symbol, interval, limit: String(safeLimit) };
  if (opts.startTime != null) params.startTime = String(Math.floor(opts.startTime));
  if (opts.endTime != null) params.endTime = String(Math.floor(opts.endTime));
  const raw = await binanceGet<BinanceKlineTuple[]>("api/v3/klines", params, { signal: opts.signal });
  return Array.isArray(raw) ? raw : [];
}
