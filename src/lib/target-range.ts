import { Decimal, isWithinRange } from "@/lib/decimal";

export type TargetStatus =
  /** 未设置区间 */
  | "none"
  /** 最新有效报价在区间内 */
  | "in_range"
  /** 最新有效报价在区间外 */
  | "out_of_range"
  /** 存在历史报价但已过期，不判断命中 */
  | "stale"
  /** 没有任何报价 */
  | "unavailable";

export interface EvaluateTargetInput {
  targetLow: string | null;
  targetHigh: string | null;
  lastPrice: string | null;
  /** 报价距现在的时长（毫秒），无报价时为 null */
  quoteAgeMs: number | null;
  staleMs: number;
}

/**
 * 判断当前是否处于目标区间。
 * 命中条件：目标下限 ≤ 最新价格 ≤ 目标上限，且报价未过期。
 * 使用精确十进制比较，不依赖四舍五入后的展示价格。
 */
export function evaluateTarget(input: EvaluateTargetInput): TargetStatus {
  const { targetLow, targetHigh, lastPrice, quoteAgeMs, staleMs } = input;
  if (targetLow == null || targetHigh == null) return "none";
  if (lastPrice == null || quoteAgeMs == null) return "unavailable";
  if (quoteAgeMs > staleMs) return "stale";

  const price = new Decimal(lastPrice);
  const low = new Decimal(targetLow);
  const high = new Decimal(targetHigh);
  if (!price.isFinite() || !low.isFinite() || !high.isFinite()) return "unavailable";
  return isWithinRange(price, low, high) ? "in_range" : "out_of_range";
}
