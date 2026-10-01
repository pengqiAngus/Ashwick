import { describe, expect, it } from "vitest";
import type { AnalysisCandle } from "@/lib/market/ohlcv";
import { clusterPrices, computeLevels, findSwings, mergeLevels } from "@/lib/quant/levels";
import { alignment, intervalRegime, overallRegime } from "@/lib/quant/regime";

function mk(closes: number[], interval: AnalysisCandle["interval"] = "1h", spread = 1): AnalysisCandle[] {
  return closes.map((c, i) => ({
    exchange: "binance",
    marketType: "spot",
    symbol: "T",
    interval,
    openTime: i * 3_600_000,
    closeTime: (i + 1) * 3_600_000 - 1,
    open: c,
    high: c + spread,
    low: c - spread,
    close: c,
    baseVolume: 1,
    quoteVolume: c,
    trades: 1,
    fetchedAt: 0,
    isClosed: true,
  }));
}

describe("levels", () => {
  it("找到摆动高低点并聚类", () => {
    // 锯齿：在 100 与 120 之间来回，形成重复触碰
    const closes: number[] = [];
    for (let k = 0; k < 8; k++) closes.push(100, 105, 110, 115, 120, 115, 110, 105);
    const c = mk(closes, "1h", 0.5);
    const swings = findSwings(c, 2);
    expect(swings.filter((s) => s.kind === "high").every((s) => s.price === 120.5)).toBe(true);
    expect(swings.filter((s) => s.kind === "low").every((s) => s.price === 99.5)).toBe(true);
    const clusters = clusterPrices(swings, 1);
    expect(clusters).toHaveLength(2);
    // 当前价 105：支撑 99.5、阻力 120.5
    const levels = computeLevels(c, "1h", { swingK: 2 });
    const sup = levels.find((l) => l.side === "support")!;
    const res = levels.find((l) => l.side === "resistance")!;
    expect(sup.price).toBeCloseTo(99.5, 6);
    expect(res.price).toBeCloseTo(120.5, 6);
    expect(sup.touches).toBeGreaterThan(1);
    expect(sup.sourceBarTimes.length).toBe(sup.touches);
    expect(sup.method).toBe("cluster");
  });
  it("跨周期合并去重", () => {
    const base = { method: "swing" as const, interval: "1h" as const, sourceBarTimes: [0] };
    const merged = mergeLevels([
      { id: "a", side: "support", price: 100, touches: 1, distancePct: -0.05, ...base },
      { id: "b", side: "support", price: 100.2, touches: 3, distancePct: -0.048, ...base, interval: "4h" },
      { id: "c", side: "resistance", price: 120, touches: 2, distancePct: 0.14, ...base },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((l) => l.side === "support")!.id).toBe("b");
  });
});

describe("regime", () => {
  it("持续上涨识别为 trending_up 且多周期一致", () => {
    const up = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(i * 0.002));
    const r1 = intervalRegime(mk(up, "1h"), "1h");
    const r4 = intervalRegime(mk(up, "4h"), "4h");
    expect(r1.trend).toBe("up");
    expect(r1.emaStack).toBe("bullish");
    const al = alignment([r1, r4]);
    expect(al.agree).toBe(true);
    expect(al.score).toBe(1);
    expect(overallRegime([r1, r4]).label).toBe("trending_up");
  });
  it("横盘识别为 ranging", () => {
    const flat = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 5) * 0.2);
    const r = intervalRegime(mk(flat, "1h"), "1h");
    expect(r.trend).toBe("flat");
    expect(overallRegime([r]).label).toBe("ranging");
  });
});
