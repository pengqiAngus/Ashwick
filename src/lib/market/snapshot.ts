import { createHash } from "node:crypto";
import type { KlineInterval } from "@/lib/types";
import type { DataQuality, SnapshotMeta } from "@/lib/agent/schemas";
import { fetchClosedKlines, type AnalysisCandle, type FetchClosedOptions } from "@/lib/market/ohlcv";
import { assessQuality } from "@/lib/market/quality";

/** 指标预热所需的最少根数（EMA200 + 缓冲） */
export const MIN_BARS_FOR_ANALYSIS = 260;

export interface Snapshot {
  meta: SnapshotMeta;
  quality: DataQuality;
  series: Record<string, AnalysisCandle[]>;
}

export function computeSnapshotId(symbol: string, cutoff: number, series: Array<{ interval: KlineInterval; lastCloseTime: number | null; count: number }>): string {
  const h = createHash("sha256");
  h.update(symbol);
  h.update("|");
  h.update(String(Math.floor(cutoff / 60_000)));
  for (const s of [...series].sort((a, b) => a.interval.localeCompare(b.interval))) {
    h.update(`|${s.interval}:${s.lastCloseTime ?? "none"}:${s.count}`);
  }
  return h.digest("hex").slice(0, 24);
}

/**
 * 获取多周期已收盘 K 线快照。所有周期共用同一个 cutoff，保证下游 Agent 看到同一时刻的数据。
 */
export async function takeSnapshot(
  symbol: string,
  intervals: KlineInterval[],
  opts: { cutoff?: number; minBars?: number; signal?: AbortSignal; fetcher?: FetchClosedOptions["fetcher"]; now?: () => number } = {},
): Promise<Snapshot> {
  const now = opts.now ?? Date.now;
  const fetchedAt = now();
  const cutoff = opts.cutoff ?? fetchedAt;
  const minBars = opts.minBars ?? MIN_BARS_FOR_ANALYSIS;
  const results = await Promise.all(
    intervals.map((interval) => fetchClosedKlines(symbol, interval, { cutoff, minBars, signal: opts.signal, fetcher: opts.fetcher, now })),
  );
  const series: Record<string, AnalysisCandle[]> = {};
  intervals.forEach((iv, i) => {
    series[iv] = results[i].candles;
  });
  const quality = assessQuality(
    intervals.map((iv, i) => ({ interval: iv, candles: results[i].candles, required: minBars, stats: results[i].stats, cutoff })),
  );
  const intervalMeta = intervals.map((iv) => {
    const c = series[iv];
    return {
      interval: iv,
      count: c.length,
      firstOpenTime: c[0]?.openTime ?? null,
      lastCloseTime: c.at(-1)?.closeTime ?? null,
    };
  });
  const meta: SnapshotMeta = {
    snapshotId: computeSnapshotId(symbol, cutoff, intervalMeta),
    symbol,
    exchange: "binance",
    marketType: "spot",
    dataCutoff: new Date(cutoff).toISOString(),
    fetchedAt: new Date(fetchedAt).toISOString(),
    intervals: intervalMeta,
  };
  return { meta, quality, series };
}
