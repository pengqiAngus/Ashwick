import { Decimal } from "@/lib/decimal";
import type { PositionSide } from "@/lib/types";

export const LEVERAGE_MIN = 1;
export const LEVERAGE_MAX = 150;

/** 剩余不足原持仓的一亿分之一时，整笔视为已平。 */
const FULL_CLOSE_REL = "1e-8";

export type CloseUnit = "usdt" | "base";

export function isLeverage(n: number): boolean {
  return Number.isInteger(n) && n >= LEVERAGE_MIN && n <= LEVERAGE_MAX;
}

/** 保证金 = 币数量 × 开仓价 / 杠杆 */
export function marginFromEntry(baseQty: Decimal, entryPrice: Decimal, leverage: number): Decimal {
  return baseQty.mul(entryPrice).div(leverage);
}

/** 逐仓简化强平价，不计维持保证金。杠杆为 1 时多单强平价为 0。 */
export function liquidationPrice(entryPrice: Decimal, leverage: number, side: PositionSide): Decimal {
  const factor = new Decimal(1).div(leverage);
  return side === "long" ? entryPrice.mul(new Decimal(1).minus(factor)) : entryPrice.mul(new Decimal(1).plus(factor));
}

/** 多：(价格 - 开仓价) × 币数量；空反过来 */
export function pnl(side: PositionSide, entryPrice: Decimal, price: Decimal, baseQty: Decimal): Decimal {
  const diff = side === "long" ? price.minus(entryPrice) : entryPrice.minus(price);
  return diff.mul(baseQty);
}

/** 盈亏 / 保证金 */
export function roiRatio(pnlValue: Decimal, margin: Decimal): Decimal {
  return pnlValue.div(margin);
}

/** 卡片上的 USDT 数量 = 币数量 × 价格 */
export function quoteQty(baseQty: Decimal, price: Decimal): Decimal {
  return baseQty.mul(price);
}

export type CloseResult =
  | {
      ok: true;
      closedBase: Decimal;
      closedMargin: Decimal;
      realizedPnl: Decimal;
      roi: Decimal;
      remainingBase: Decimal;
      remainingMargin: Decimal;
      fullyClosed: boolean;
    }
  | { ok: false; reason: "exceeds" | "nonpositive" };

/**
 * 按平仓价把 USDT 数量换成币。释放保证金按平掉比例计算。
 * ponytail: 相对尘埃阈值，不做绝对最小下单量。
 */
export function settleClose(input: {
  side: PositionSide;
  entryPrice: Decimal;
  margin: Decimal;
  baseQty: Decimal;
  amount: Decimal;
  unit: CloseUnit;
  closePrice: Decimal;
}): CloseResult {
  if (!input.amount.isFinite() || input.amount.lte(0) || !input.baseQty.isFinite() || input.baseQty.lte(0)) {
    return { ok: false, reason: "nonpositive" };
  }
  const closedRaw = input.unit === "base" ? input.amount : input.amount.div(input.closePrice);
  if (closedRaw.gt(input.baseQty)) return { ok: false, reason: "exceeds" };

  const fullyClosed = input.baseQty.minus(closedRaw).lte(input.baseQty.mul(FULL_CLOSE_REL));
  const closedBase = fullyClosed ? input.baseQty : closedRaw;
  const closedMargin = fullyClosed ? input.margin : input.margin.mul(closedBase.div(input.baseQty));
  const realizedPnl = pnl(input.side, input.entryPrice, input.closePrice, closedBase);
  return {
    ok: true,
    closedBase,
    closedMargin,
    realizedPnl,
    roi: roiRatio(realizedPnl, closedMargin),
    remainingBase: fullyClosed ? new Decimal(0) : input.baseQty.minus(closedBase),
    remainingMargin: fullyClosed ? new Decimal(0) : input.margin.minus(closedMargin),
    fullyClosed,
  };
}
