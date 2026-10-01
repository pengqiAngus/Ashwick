import { describe, expect, it } from "vitest";
import type { BinanceKlineTuple } from "@/lib/binance/types";
import { INTERVAL_MS } from "@/lib/market/ohlcv";
import { computeSnapshotId, takeSnapshot } from "@/lib/market/snapshot";

function series(interval: "1h" | "4h" | "1d", untilMs: number, n: number): BinanceKlineTuple[] {
  const step = INTERVAL_MS[interval];
  const lastOpen = Math.floor(untilMs / step) * step; // 当前正在形成的那根
  const rows: BinanceKlineTuple[] = [];
  for (let i = n; i >= 0; i--) {
    const open = lastOpen - i * step;
    rows.push([open, "100", "101", "99", "100", "1", open + step - 1, "100", 1, "1", "1", "0"]);
  }
  return rows;
}

describe("takeSnapshot", () => {
  it("多周期共用 cutoff，剔除正在形成的 K 线，元数据与 id 稳定", async () => {
    const now = Date.UTC(2026, 0, 10, 12, 30); // 12:30 → 1h 正在形成的是 12:00 根
    const fetcher = async (_s: string, interval: "1h" | "4h" | "1d") => series(interval, now, 300);
    const snap = await takeSnapshot("BTCUSDT", ["1h", "4h", "1d"], { fetcher: fetcher as never, now: () => now, minBars: 260 });
    expect(snap.meta.dataCutoff).toBe(new Date(now).toISOString());
    const h1 = snap.meta.intervals.find((i) => i.interval === "1h")!;
    expect(h1.lastCloseTime).toBe(Date.UTC(2026, 0, 10, 12, 0) - 1);
    const d1 = snap.meta.intervals.find((i) => i.interval === "1d")!;
    expect(d1.lastCloseTime).toBe(Date.UTC(2026, 0, 10, 0, 0) - 1);
    expect(snap.quality.ok).toBe(true);
    expect(snap.series["1h"].every((c) => c.closeTime <= now)).toBe(true);
    const id2 = computeSnapshotId("BTCUSDT", now, snap.meta.intervals);
    expect(snap.meta.snapshotId).toBe(id2);
    expect(computeSnapshotId("ETHUSDT", now, snap.meta.intervals)).not.toBe(id2);
  });
  it("根数不足时质量检查不通过", async () => {
    const now = Date.UTC(2026, 0, 10, 12, 30);
    const fetcher = async (_s: string, interval: "1h") => series(interval, now, 50);
    const snap = await takeSnapshot("BTCUSDT", ["1h"], { fetcher: fetcher as never, now: () => now, minBars: 260 });
    expect(snap.quality.ok).toBe(false);
    expect(snap.quality.warnings.some((w) => w.includes("少于"))).toBe(true);
  });
});
