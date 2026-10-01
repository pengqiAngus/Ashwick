import { describe, expect, it } from "vitest";
import { cumulativeCurve, filterClosesByRange, pnlByToken, rangeForWindow, summarizeCloses } from "@/lib/close-stats";
import type { PositionCloseDto } from "@/lib/types";

function close(partial: Partial<PositionCloseDto> & Pick<PositionCloseDto, "id" | "realizedPnl" | "createdAt">): PositionCloseDto {
  return {
    positionId: "p",
    symbol: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    side: "long",
    entryPrice: "100",
    closePrice: "110",
    closedBase: "1",
    closedMargin: "10",
    roi: "0",
    ...partial,
  };
}

const NOW = Date.parse("2026-09-30T00:00:00.000Z");

describe("日期区间", () => {
  const closes = [
    close({ id: "recent", realizedPnl: "1", createdAt: "2026-09-28T00:00:00.000Z" }),
    close({ id: "old", realizedPnl: "2", createdAt: "2026-09-10T00:00:00.000Z" }),
  ];

  it("7 天只含最近一笔，自定义区间和全部按日期含首尾", () => {
    expect(filterClosesByRange(closes, rangeForWindow("7d", NOW)).map((row) => row.id)).toEqual(["recent"]);
    expect(filterClosesByRange(closes, { start: "2026-09-01", end: "2026-09-15" }).map((row) => row.id)).toEqual(["old"]);
    expect(filterClosesByRange(closes, rangeForWindow("all", NOW))).toHaveLength(2);
  });
});

describe("汇总", () => {
  const closes = [
    close({ id: "win", realizedPnl: "5", closedMargin: "10", side: "long", createdAt: "2026-09-01T00:00:00.000Z" }),
    close({ id: "loss", realizedPnl: "-1", closedMargin: "10", side: "short", symbol: "ETHUSDT", baseAsset: "ETH", createdAt: "2026-09-02T00:00:00.000Z" }),
  ];

  it("加权回报率与盈亏比", () => {
    const summary = summarizeCloses(closes);
    expect(summary.pnl).toBe("4");
    expect(summary.winRate).toBe("0.5");
    expect(summary.weightedRoi).toBe("0.2");
    expect(summary.profitFactor).toBe("5");
    expect(summary.maxWin).toBe("5");
    expect(summary.maxLoss).toBe("-1");
    expect(summary.longPnl).toBe("5");
    expect(summary.shortPnl).toBe("-1");
  });

  it("没有亏损时盈亏比为 null", () => {
    expect(summarizeCloses([closes[0]!]).profitFactor).toBeNull();
    expect(summarizeCloses([]).winRate).toBeNull();
  });
});

describe("分币与曲线", () => {
  const closes = [
    close({ id: "b1", symbol: "BTCUSDT", baseAsset: "BTC", realizedPnl: "10", createdAt: "2026-09-02T00:00:00.000Z" }),
    close({ id: "e1", symbol: "ETHUSDT", baseAsset: "ETH", realizedPnl: "-3", createdAt: "2026-09-03T00:00:00.000Z" }),
    close({ id: "b2", symbol: "BTCUSDT", baseAsset: "BTC", realizedPnl: "2", createdAt: "2026-09-01T00:00:00.000Z" }),
  ];

  it("同一币种合并，按绝对盈亏排序", () => {
    const tokens = pnlByToken(closes);
    expect(tokens.map((row) => [row.symbol, row.pnl, row.count])).toEqual([
      ["BTCUSDT", "12", 2],
      ["ETHUSDT", "-3", 1],
    ]);
  });

  it("曲线按时间累加", () => {
    expect(cumulativeCurve(closes).map((point) => point.cumulative)).toEqual(["2", "12", "9"]);
  });
});
