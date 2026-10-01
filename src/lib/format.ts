import { Decimal, toPlainString } from "@/lib/decimal";

/** 整数部分加千分位 */
function groupInteger(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 按精度格式化价格字符串，带千分位。
 * 当价格极小且给定精度不足以表达时，自动扩展到能显示至少 2 位有效数字。
 */
export function formatPrice(raw: string | null | undefined, precision = 2): string {
  if (raw == null || raw === "") return "—";
  const d = new Decimal(raw);
  if (!d.isFinite()) return "—";
  let p = Math.max(0, Math.min(precision, 18));
  if (!d.isZero() && d.abs().lt(new Decimal(10).pow(-p))) {
    const plain = toPlainString(d.abs());
    const frac = plain.split(".")[1] ?? "";
    const leadingZeros = frac.match(/^0*/)?.[0].length ?? 0;
    p = Math.min(18, leadingZeros + 2);
  }
  const fixed = d.toFixed(p);
  const negative = fixed.startsWith("-");
  const [intPart, fracPart] = fixed.replace("-", "").split(".");
  const grouped = groupInteger(intPart);
  return `${negative ? "-" : ""}${grouped}${fracPart ? "." + fracPart : ""}`;
}

/** 带符号的涨跌额 */
export function formatSignedPrice(raw: string | null | undefined, precision = 2): string {
  if (raw == null || raw === "") return "—";
  const d = new Decimal(raw);
  if (!d.isFinite()) return "—";
  const body = formatPrice(d.abs().toFixed(), precision);
  if (d.isZero()) return body;
  return `${d.isNegative() ? "-" : "+"}${body}`;
}

/** 涨跌幅：+1.00% */
export function formatPercent(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = new Decimal(raw);
  if (!d.isFinite()) return "—";
  const sign = d.isZero() ? "" : d.isNegative() ? "-" : "+";
  return `${sign}${d.abs().toFixed(2)}%`;
}

/** 涨跌方向 */
export function changeDirection(raw: string | null | undefined): "up" | "down" | "flat" {
  if (raw == null || raw === "") return "flat";
  const d = new Decimal(raw);
  if (!d.isFinite() || d.isZero()) return "flat";
  return d.isNegative() ? "down" : "up";
}

export function formatPair(baseAsset: string, quoteAsset: string): string {
  return `${baseAsset} / ${quoteAsset}`;
}

/** 相对时间：刚刚 / 12 秒前 / 3 分钟前 */
export function formatRelativeTime(ageMs: number): string {
  if (ageMs < 3_000) return "刚刚";
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

/** 东八区日期时间。固定时区，服务端和浏览器渲染结果一致。 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}
