import { describe, expect, it } from "vitest";
import type { BinanceKlineTuple } from "@/lib/binance/types";
import { countGaps, fetchClosedKlines, mergeCandles, normalizeAnalysisCandles } from "@/lib/market/ohlcv";

const H = 3_600_000;
function tuple(openTime: number, close = 100, extra: Partial<Record<number, string | number>> = {}): BinanceKlineTuple {
  const t: (string | number)[] = [openTime, "100", "101", "99", String(close), "10", openTime + H - 1, "1000", 5, "5", "500", "0"];
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) t[Number(k)] = v;
  return t as unknown as BinanceKlineTuple;
}

describe("normalizeAnalysisCandles", () => {
  it("只保留 closeTime <= cutoff 的 K 线，剔除未收盘", () => {
    const cutoff = 3 * H; // 第 4 根 (openTime=3H) closeTime=4H-1 > cutoff
    const raw = [tuple(0), tuple(H), tuple(2 * H), tuple(3 * H)];
    const { candles, stats } = normalizeAnalysisCandles(raw, { symbol: "X", interval: "1h", cutoff, fetchedAt: cutoff });
    expect(candles.map((c) => c.openTime)).toEqual([0, H, 2 * H]);
    expect(stats.openRemoved).toBe(1);
    expect(candles[0].isClosed).toBe(true);
    expect(candles[0].baseVolume).toBe(10);
    expect(candles[0].quoteVolume).toBe(1000);
    expect(candles[0].trades).toBe(5);
  });
  it("去重（同 openTime 保留最后一条）并升序排序", () => {
    const raw = [tuple(2 * H, 100), tuple(0), tuple(2 * H, 100.5), tuple(H)];
    const { candles, stats } = normalizeAnalysisCandles(raw, { symbol: "X", interval: "1h", cutoff: 10 * H, fetchedAt: 10 * H });
    expect(candles.map((c) => c.openTime)).toEqual([0, H, 2 * H]);
    expect(candles[2].close).toBe(100.5);
    expect(stats.duplicatesRemoved).toBe(1);
  });
  it("剔除非有限值与非法 OHLC", () => {
    const raw = [tuple(0, 100, { 4: "abc" }), tuple(H, 100, { 3: "150" }), tuple(2 * H, 100, { 5: "-1" }), tuple(3 * H)];
    const { candles, stats } = normalizeAnalysisCandles(raw, { symbol: "X", interval: "1h", cutoff: 10 * H, fetchedAt: 10 * H });
    expect(candles).toHaveLength(1);
    expect(stats.invalidRemoved).toBe(3);
  });
});

describe("countGaps / mergeCandles", () => {
  it("统计缺口", () => {
    const { candles } = normalizeAnalysisCandles([tuple(0), tuple(H), tuple(3 * H)], { symbol: "X", interval: "1h", cutoff: 10 * H, fetchedAt: 0 });
    expect(countGaps(candles, "1h")).toBe(1);
  });
  it("跨页合并去重", () => {
    const a = normalizeAnalysisCandles([tuple(0), tuple(H)], { symbol: "X", interval: "1h", cutoff: 10 * H, fetchedAt: 0 }).candles;
    const b = normalizeAnalysisCandles([tuple(H), tuple(2 * H)], { symbol: "X", interval: "1h", cutoff: 10 * H, fetchedAt: 0 }).candles;
    const m = mergeCandles([b, a]);
    expect(m.candles.map((c) => c.openTime)).toEqual([0, H, 2 * H]);
    expect(m.duplicatesRemoved).toBe(1);
  });
});

describe("fetchClosedKlines 分页", () => {
  it("向前翻页直到满足 minBars，并传入正确的 endTime", async () => {
    const calls: Array<{ endTime?: number }> = [];
    const total = 2500;
    const fetcher = async (_s: string, _i: "1h", opts: { endTime?: number; limit?: number }) => {
      calls.push({ endTime: opts.endTime });
      const end = Math.floor((opts.endTime ?? total * H) / H); // 最大 openTime 索引
      const start = Math.max(0, end - 999);
      const rows: BinanceKlineTuple[] = [];
      for (let i = start; i <= end; i++) rows.push(tuple(i * H));
      return rows;
    };
    const cutoff = total * H; // openTime <= total*H - 1 → 最大索引 total-1
    const res = await fetchClosedKlines("X", "1h", { cutoff, minBars: 1500, fetcher: fetcher as never, now: () => cutoff });
    expect(res.stats.pages).toBe(2);
    expect(res.candles.length).toBe(2000);
    expect(res.candles.at(-1)!.openTime).toBe((total - 1) * H);
    expect(calls[0].endTime).toBe(cutoff - 1);
    expect(calls[1].endTime).toBe((total - 1000) * H - 1);
  });
  it("历史耗尽时停止", async () => {
    const fetcher = async () => [tuple(0), tuple(H)];
    const res = await fetchClosedKlines("X", "1h", { cutoff: 10 * H, minBars: 500, fetcher: fetcher as never, now: () => 10 * H });
    expect(res.stats.pages).toBe(1);
    expect(res.candles).toHaveLength(2);
  });
  it("已取消的 signal 直接抛出", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(fetchClosedKlines("X", "1h", { minBars: 10, signal: ac.signal, fetcher: (async () => []) as never })).rejects.toThrow();
  });
});
