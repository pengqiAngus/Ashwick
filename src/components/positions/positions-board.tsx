"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PositionCard } from "@/components/positions/position-card";
import { useNow } from "@/hooks/use-now";
import { useTickers } from "@/hooks/use-tickers";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatRelativeTime } from "@/lib/format";
import type { PositionDto, SymbolInfo } from "@/lib/types";

export function PositionsBoard({
  positions,
  symbolInfos,
  loadError,
}: {
  positions: PositionDto[];
  symbolInfos: Record<string, SymbolInfo>;
  loadError: string | null;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [target, setTarget] = useState<PositionDto | null>(null);
  const [saving, startSaving] = useTransition();
  const shown = useMemo(() => positions.filter((row) => !gone.includes(row.id)), [positions, gone]);
  const symbols = useMemo(() => shown.map((p) => p.symbol), [shown]);
  const tickers = useTickers(symbols);
  const now = useNow(1000);
  const quoteError = tickers.error ? errorMessage(tickers.error, "行情获取失败") : null;
  const age = tickers.lastUpdatedAt == null ? null : now - tickers.lastUpdatedAt;

  if (loadError) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <AlertCircleIcon className="size-6 text-destructive" aria-hidden />
        <h2 className="text-lg font-semibold">无法读取仓位</h2>
        <p className="text-sm text-muted-foreground">{loadError}</p>
      </section>
    );
  }

  const remove = () => {
    if (!target || saving) return;
    const id = target.id;
    const symbol = target.symbol;
    startSaving(async () => {
      try {
        await apiFetch(`/api/positions/${encodeURIComponent(id)}`, { method: "DELETE" });
        setGone((ids) => [...ids, id]);
        setTarget(null);
        toast.success(`已删除 ${symbol}`);
        router.refresh();
      } catch (err) {
        toast.error(errorMessage(err, "删除仓位失败"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {shown.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>共 {shown.length} 个未平仓位 · 价格以 USDT 计价</span>
          <div aria-live="polite">
            {quoteError && age == null ? (
              <span className="text-destructive">{quoteError}</span>
            ) : age != null ? (
              <>
                行情更新于 {formatRelativeTime(age)}
                {quoteError && <span className="ml-2 text-destructive">最近一次刷新失败</span>}
              </>
            ) : (
              <Skeleton className="inline-block h-3 w-16 align-middle" role="status" aria-label="加载中" />
            )}
          </div>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">还没有未平仓位。开仓后会出现在这里。</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="未平仓位">
          {shown.map((position) => (
            <li key={position.id} className="min-w-0">
              <PositionCard
                position={position}
                lastPrice={tickers.bySymbol.get(position.symbol)?.lastPrice ?? null}
                precision={symbolInfos[position.symbol]?.pricePrecision ?? 2}
                quoteUpdatedAt={tickers.lastUpdatedAt}
                quoteError={quoteError}
                now={now}
                onClosed={() => router.refresh()}
                onDelete={() => setTarget(position)}
              />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDeleteDialog
        open={target != null}
        title={target ? `删除 ${target.baseAsset} 仓位` : "删除仓位"}
        description="删除后这个未平仓位不再显示。已经产生的平仓记录会一起删掉，之后的盈亏统计也不会再算它们。"
        pending={saving}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onConfirm={remove}
      />
    </div>
  );
}
