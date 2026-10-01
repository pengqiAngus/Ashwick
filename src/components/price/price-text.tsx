import { cn } from "@/lib/utils";
import { changeDirection, formatPercent, formatPrice, formatSignedPrice } from "@/lib/format";

export function PriceText({
  value,
  precision,
  className,
  unit = "USDT",
}: {
  value: string | null | undefined;
  precision: number;
  className?: string;
  unit?: string | null;
}) {
  return (
    <span className={cn("tabular", className)}>
      {formatPrice(value, precision)}
      {unit && value != null && <span className="ml-1.5 text-[0.6em] font-normal text-muted-foreground">{unit}</span>}
    </span>
  );
}

/** 24 小时涨跌额与涨跌幅。方向同时用颜色与符号表达 */
export function ChangeText({
  change,
  changePercent,
  precision,
  className,
}: {
  change: string | null | undefined;
  changePercent: string | null | undefined;
  precision: number;
  className?: string;
}) {
  const dir = changeDirection(changePercent ?? change);
  return (
    <span
      className={cn(
        "tabular inline-flex flex-wrap items-baseline gap-x-2",
        dir === "up" && "text-up",
        dir === "down" && "text-down",
        dir === "flat" && "text-muted-foreground",
        className,
      )}
    >
      <span>{formatSignedPrice(change, precision)}</span>
      <span>{formatPercent(changePercent)}</span>
    </span>
  );
}
