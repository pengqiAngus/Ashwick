import { Decimal, parsePositiveDecimal, toPlainString } from "@/lib/decimal";

export type TargetRangeValidation =
  | { ok: true; low: string | null; high: string | null }
  | { ok: false; message: string };

/**
 * 校验目标区间输入（客户端与服务端共用）：
 * - 两者都为空（null 或空串）→ 清除区间
 * - 只填一个 → 提示补齐
 * - 均须为大于 0 的有效十进制数，且下限 ≤ 上限（允许相等）
 * - 适配数据库列 DECIMAL(38,18)
 */
export function validateTargetRange(input: { low: unknown; high: unknown }): TargetRangeValidation {
  const lowRaw = input.low == null ? "" : String(input.low).trim();
  const highRaw = input.high == null ? "" : String(input.high).trim();

  if (lowRaw === "" && highRaw === "") return { ok: true, low: null, high: null };
  if (lowRaw === "" || highRaw === "") return { ok: false, message: "请同时填写目标下限和目标上限" };

  const low = parsePositiveDecimal(lowRaw);
  const high = parsePositiveDecimal(highRaw);
  if (!low.ok) return { ok: false, message: low.reason === "nonpositive" ? "目标下限必须大于 0" : "目标下限不是有效的数字" };
  if (!high.ok) return { ok: false, message: high.reason === "nonpositive" ? "目标上限必须大于 0" : "目标上限不是有效的数字" };
  if (low.value.gt(high.value)) return { ok: false, message: "目标下限不能大于目标上限" };

  for (const [label, v] of [["目标下限", low.value], ["目标上限", high.value]] as const) {
    if (v.decimalPlaces() > 18) return { ok: false, message: `${label}最多支持 18 位小数` };
    if (v.gte(new Decimal(10).pow(20))) return { ok: false, message: `${label}超出可保存范围` };
  }
  return { ok: true, low: toPlainString(low.value), high: toPlainString(high.value) };
}
