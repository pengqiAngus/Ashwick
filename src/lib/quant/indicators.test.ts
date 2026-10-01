import { describe, expect, it } from "vitest";
import { atr, bollinger, computeIndicatorSet, ema, macd, realizedVol, rsi, sma, volumeChange } from "@/lib/quant/indicators";
import type { AnalysisCandle } from "@/lib/market/ohlcv";

function mkCandles(closes: number[], interval: "1h" = "1h"): AnalysisCandle[] {
  return closes.map((c, i) => ({
    exchange: "binance",
    marketType: "spot",
    symbol: "TESTUSDT",
    interval,
    openTime: i * 3_600_000,
    closeTime: (i + 1) * 3_600_000 - 1,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    baseVolume: 100 + i,
    quoteVolume: (100 + i) * c,
    trades: 10,
    fetchedAt: 0,
    isClosed: true,
  }));
}

describe("sma / ema", () => {
  it("sma 预热期为 null，之后为窗口均值", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("ema 以 SMA 为种子后按 k=2/(n+1) 递推", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[2]).toBe(2);
    // k = 0.5：(4*0.5 + 2*0.5) = 3；(5*0.5+3*0.5)=4
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });
  it("拒绝非有限值", () => {
    expect(() => ema([1, Number.NaN, 3], 2)).toThrow();
  });
});

describe("rsi", () => {
  it("单边上涨为 100，长度不足为 null", () => {
    const up = Array.from({ length: 20 }, (_, i) => 100 + i);
    const out = rsi(up, 14);
    expect(out[13]).toBeNull();
    expect(out[14]).toBe(100);
    expect(out[19]).toBe(100);
  });
  it("与参考值一致（经典 14 期示例）", () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const out = rsi(closes, 14);
    expect(out[14]).toBeCloseTo(70.46, 1);
    expect(out[19]).toBeCloseTo(57.97, 0);
  });
});

describe("macd / atr / bollinger", () => {
  it("macd 线为 ema12-ema26，signal 有 9 期预热", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const m = macd(closes);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).not.toBeNull();
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).not.toBeNull();
    const e12 = ema(closes, 12)[59] as number;
    const e26 = ema(closes, 26)[59] as number;
    expect(m.macd[59]).toBeCloseTo(e12 - e26, 10);
  });
  it("atr 常量波幅时等于该波幅", () => {
    const n = 30;
    const high = Array(n).fill(102);
    const low = Array(n).fill(98);
    const close = Array(n).fill(100);
    const out = atr(high, low, close, 14);
    expect(out[12]).toBeNull();
    expect(out[13]).toBeCloseTo(4, 10);
    expect(out[29]).toBeCloseTo(4, 10);
  });
  it("bollinger 常量序列带宽为 0", () => {
    const bb = bollinger(Array(25).fill(50), 20, 2);
    expect(bb.middle[24]).toBe(50);
    expect(bb.upper[24]).toBe(50);
    expect(bb.widthPct[24]).toBe(0);
  });
});

describe("returns / volume", () => {
  it("realizedVol 数据不足返回 null，常量价格为 0", () => {
    expect(realizedVol([1, 2, 3], 20)).toBeNull();
    expect(realizedVol(Array(30).fill(10), 20)).toBe(0);
  });
  it("volumeChange 相对前 20 根均量", () => {
    const vols = [...Array(20).fill(100), 150];
    expect(volumeChange(vols, 20)).toBeCloseTo(0.5, 10);
  });
});

describe("computeIndicatorSet", () => {
  it("数据不足时长周期指标为 null，其余有值", () => {
    const set = computeIndicatorSet(mkCandles(Array.from({ length: 60 }, (_, i) => 100 + i)), "1h");
    expect(set.ema20).not.toBeNull();
    expect(set.ema50).not.toBeNull();
    expect(set.ema200).toBeNull();
    expect(set.rsi14).toBe(100);
    expect(set.barsUsed).toBe(60);
    expect(set.returns.r1).toBeCloseTo(1 / 158, 6);
  });
  it("空序列抛错", () => {
    expect(() => computeIndicatorSet([], "1h")).toThrow();
  });
});
