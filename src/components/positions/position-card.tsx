"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRightIcon } from "lucide-react";
import { Decimal, toPlainString } from "@/lib/decimal";
import { publicEnv } from "@/lib/env";
import { changeDirection, formatPair, formatPercent, formatPrice, formatRelativeTime, formatSignedPrice } from "@/lib/format";
import { liquidationPrice, marginFromEntry, pnl, quoteQty, roiRatio } from "@/lib/position-math";
import { cn } from "@/lib/utils";
import type { PositionDto, PositionSide } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CloseDialog } from "@/components/positions/close-dialog";

const SIDE_LABEL: Record<PositionSide, string> = { long: "开多", short: "开空" };

function formatAmount(raw: string): string {
  const frac = toPlainString(raw).split(".")[1]?.length ?? 0;
  return formatPrice(raw, Math.min(8, frac));
}

function formatRoi(ratio: Decimal): string {
  return formatPercent(ratio.mul(100).toFixed());
}

export function PositionCard({
  position,
  lastPrice,
  precision,
  quoteUpdatedAt,
  quoteError,
  now,
  onClosed,
  onDelete,
}: {
  position: PositionDto;
  lastPrice: string | null;
  precision: number;
  quoteUpdatedAt: number | null;
  quoteError: string | null;
  now: number;
  onClosed: () => void;
  onDelete: () => void;
}) {
  const [showQuote, setShowQuote] = useState(true);
  const live = useMemo(() => {
    const entry = new Decimal(position.entryPrice);
    const base = new Decimal(position.baseQty);
    const margin = marginFromEntry(base, entry, position.leverage);
    const liq = liquidationPrice(entry, position.leverage, position.side);
    if (!lastPrice) return { margin, liq, pnl: null as Decimal | null, roi: null as Decimal | null, quote: null as Decimal | null };
    const mark = new Decimal(lastPrice);
    const u = pnl(position.side, entry, mark, base);
    return { margin, liq, pnl: u, roi: roiRatio(u, margin), quote: quoteQty(base, mark) };
  }, [position, lastPrice]);

  const sizeText = showQuote
    ? live.quote
      ? `${formatAmount(toPlainString(live.quote))} USDT`
      : "— USDT"
    : `${formatAmount(position.baseQty)} ${position.baseAsset}`;
  const pnlDir = live.pnl ? changeDirection(toPlainString(live.pnl)) : "flat";
  const age = quoteUpdatedAt == null ? null : now - quoteUpdatedAt;
  const stale = age != null && age > publicEnv.quoteStaleMs;

  return (
    <article aria-label={`${position.symbol} 仓位`} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-panel">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/chart?symbol=${encodeURIComponent(position.symbol)}`}
            className="rounded-sm text-base font-semibold tracking-tight outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {formatPair(position.baseAsset, position.quoteAsset)}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">{position.symbol}</p>
        </div>
        <span className={cn("text-sm font-medium", position.side === "long" ? "text-up" : "text-down")}>{SIDE_LABEL[position.side]}</span>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <Stat label="保证金" value={`${formatAmount(toPlainString(live.margin))} USDT`} />
        <Stat label="杠杆" value={`${position.leverage}x`} />
        <Stat label="开仓价格" value={formatPrice(position.entryPrice, precision)} />
        <Stat label="当前价格" value={lastPrice ? formatPrice(lastPrice, precision) : "—"} />
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">持仓</dt>
          <dd>
            <button
              type="button"
              className="inline-flex items-center gap-1 tabular text-left font-medium outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => setShowQuote((v) => !v)}
              aria-label={showQuote ? "切换为币数量" : "切换为 USDT 数量"}
            >
              {sizeText}
              <ArrowLeftRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </dd>
        </div>
        <Stat
          label="未实现盈亏"
          value={live.pnl ? formatSignedPrice(toPlainString(live.pnl), Math.max(2, precision)) : "—"}
          className={pnlDir === "up" ? "text-up" : pnlDir === "down" ? "text-down" : undefined}
        />
        <Stat
          label="投资回报率"
          value={live.roi ? formatRoi(live.roi) : "—"}
          className={pnlDir === "up" ? "text-up" : pnlDir === "down" ? "text-down" : undefined}
        />
        <Stat label="强平价格" value={formatPrice(toPlainString(live.liq), precision)} />
      </dl>
      <div className="min-h-4 text-xs text-muted-foreground">
        {age != null ? (
          <>
            更新于 {formatRelativeTime(age)}
            {stale && <span className="ml-2 text-destructive">行情已过期</span>}
          </>
        ) : quoteError ? (
          <span className="text-destructive">{quoteError}</span>
        ) : (
          <Skeleton className="inline-block h-3 w-16 align-middle" role="status" aria-label="加载中" />
        )}
      </div>
      <footer className="flex justify-end gap-2">
        <Button type="button" variant="destructive" size="sm" aria-label={`删除 ${position.symbol}`} onClick={onDelete}>
          删除
        </Button>
        <CloseDialog position={position} lastPrice={lastPrice} onClosed={onClosed} />
      </footer>
    </article>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular font-medium", className)}>{value}</dd>
    </div>
  );
}
