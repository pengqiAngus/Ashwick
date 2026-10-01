import DecimalBase from "decimal.js";

/**
 * 项目统一使用的精确十进制类型。
 * 关闭指数表示，保证极小价格（如 0.00000001）以普通小数输出。
 */
export const Decimal = DecimalBase.clone({
  precision: 60,
  rounding: DecimalBase.ROUND_HALF_UP,
  toExpNeg: -60,
  toExpPos: 60,
});
export type Decimal = InstanceType<typeof Decimal>;

/** 允许的十进制输入：可选前导数字、可选小数部分，不允许符号、指数、千分位 */
const DECIMAL_INPUT_RE = /^(?:\d+\.?\d*|\.\d+)$/;

export type PositiveDecimalResult =
  | { ok: true; value: Decimal }
  | { ok: false; reason: "empty" | "invalid" | "nonpositive" };

/** 解析用户输入为大于 0 的十进制数 */
export function parsePositiveDecimal(raw: unknown): PositiveDecimalResult {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const s = raw.trim();
  if (s === "") return { ok: false, reason: "empty" };
  if (!DECIMAL_INPUT_RE.test(s)) return { ok: false, reason: "invalid" };
  const d = new Decimal(s);
  if (!d.isFinite()) return { ok: false, reason: "invalid" };
  if (d.lte(0)) return { ok: false, reason: "nonpositive" };
  return { ok: true, value: d };
}

/** 币安返回的价格字符串是否为有效正数 */
export function isValidPriceString(raw: unknown): raw is string {
  if (typeof raw !== "string" || !DECIMAL_INPUT_RE.test(raw.trim())) return false;
  const d = new Decimal(raw.trim());
  return d.isFinite() && d.gt(0);
}

/** 去掉多余的小数末尾 0，输出普通小数字符串 */
export function toPlainString(value: Decimal | string): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  const s = d.toFixed();
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/** 由币安 PRICE_FILTER.tickSize（如 "0.01000000"）推导价格小数位数 */
export function precisionFromTickSize(tickSize: string): number {
  const d = new Decimal(tickSize);
  if (!d.isFinite() || d.lte(0)) return 2;
  const plain = toPlainString(d);
  const idx = plain.indexOf(".");
  return idx === -1 ? 0 : plain.length - idx - 1;
}

/** Lightweight Charts priceFormat.minMove */
export function minMoveFromPrecision(precision: number): number {
  return Number((1 / 10 ** precision).toFixed(precision));
}

/** 闭区间比较：low ≤ price ≤ high */
export function isWithinRange(price: Decimal, low: Decimal, high: Decimal): boolean {
  return price.gte(low) && price.lte(high);
}
