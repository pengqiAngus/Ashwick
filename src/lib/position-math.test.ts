import { describe, expect, it } from "vitest";
import { Decimal } from "@/lib/decimal";
import { liquidationPrice, marginFromEntry, pnl, roiRatio, settleClose } from "@/lib/position-math";

const d = (s: string) => new Decimal(s);

describe("开仓数量与强平价", () => {
  it("1 个币、开仓价 100、10 倍，保证金 10", () => {
    expect(marginFromEntry(d("1"), d("100"), 10).toFixed()).toBe("10");
  });

  it("多单强平价下移 1/杠杆，空单上移", () => {
    expect(liquidationPrice(d("100"), 10, "long").toFixed()).toBe("90");
    expect(liquidationPrice(d("100"), 10, "short").toFixed()).toBe("110");
    expect(liquidationPrice(d("100"), 1, "long").toFixed()).toBe("0");
  });
});

describe("盈亏", () => {
  it("多单现价上涨盈利，空单现价下跌盈利", () => {
    expect(pnl("long", d("100"), d("110"), d("1")).toFixed()).toBe("10");
    expect(pnl("short", d("100"), d("90"), d("1")).toFixed()).toBe("10");
    expect(roiRatio(d("10"), d("10")).toFixed()).toBe("1");
  });
});

describe("平仓", () => {
  const open = { side: "long" as const, entryPrice: d("100"), margin: d("10"), baseQty: d("1") };

  it("平掉一半币，保证金和数量各剩一半", () => {
    const r = settleClose({ ...open, amount: d("0.5"), unit: "base", closePrice: d("110") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.closedBase.toFixed()).toBe("0.5");
    expect(r.closedMargin.toFixed()).toBe("5");
    expect(r.realizedPnl.toFixed()).toBe("5");
    expect(r.roi.toFixed()).toBe("1");
    expect(r.remainingBase.toFixed()).toBe("0.5");
    expect(r.remainingMargin.toFixed()).toBe("5");
    expect(r.fullyClosed).toBe(false);
  });

  it("USDT 数量按平仓价换算成币", () => {
    const r = settleClose({ ...open, amount: d("55"), unit: "usdt", closePrice: d("110") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.closedBase.toFixed()).toBe("0.5");
    expect(r.realizedPnl.toFixed()).toBe("5");
  });

  it("空单平仓价低于开仓价为盈利", () => {
    const r = settleClose({
      side: "short",
      entryPrice: d("100"),
      margin: d("10"),
      baseQty: d("1"),
      amount: d("1"),
      unit: "base",
      closePrice: d("80"),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.realizedPnl.toFixed()).toBe("20");
    expect(r.fullyClosed).toBe(true);
    expect(r.remainingBase.toFixed()).toBe("0");
  });

  it("超过剩余持仓时拒绝", () => {
    const r = settleClose({ ...open, amount: d("1.1"), unit: "base", closePrice: d("100") });
    expect(r).toEqual({ ok: false, reason: "exceeds" });
  });
});
