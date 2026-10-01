"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircleIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FavoriteCard } from "@/components/favorites/favorite-card";
import { useNow } from "@/hooks/use-now";
import { useTickers } from "@/hooks/use-tickers";
import { errorMessage } from "@/lib/client-api";
import { formatRelativeTime } from "@/lib/format";
import type { FavoriteDto, SymbolInfo } from "@/lib/types";

export function FavoritesGrid({
  initialFavorites,
  symbolInfos,
  loadError,
}: {
  initialFavorites: FavoriteDto[];
  /** 服务端预取的交易对精度信息；缺失表示该交易对当前不可交易 */
  symbolInfos: Record<string, SymbolInfo>;
  loadError: string | null;
}) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const symbols = useMemo(() => favorites.map((f) => f.symbol), [favorites]);
  const tickers = useTickers(symbols);
  const now = useNow(1000);
  const quoteError = tickers.error ? errorMessage(tickers.error, "行情获取失败") : null;

  if (loadError) {
    return (
      <EmptyState
        icon={<AlertCircleIcon className="size-6" aria-hidden />}
        title="无法读取收藏列表"
        description={loadError}
        tone="error"
      />
    );
  }

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon className="size-6" aria-hidden />}
        title="还没有收藏任何交易对"
        description="在 K 线页点击“收藏”，即可在这里查看行情并设置目标价格区间。"
        action={
          <Button nativeButton={false} render={<Link href="/" />}>
            <SearchIcon aria-hidden />
            去搜索
          </Button>
        }
      />
    );
  }

  const age = tickers.lastUpdatedAt == null ? null : now - tickers.lastUpdatedAt;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>共 {favorites.length} 个收藏 · 价格以 USDT 计价</span>
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
      <motion.ul layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="收藏列表">
        <AnimatePresence initial={false}>
          {favorites.map((f) => (
            <motion.li
              key={f.symbol}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="min-w-0"
            >
              <FavoriteCard
                favorite={f}
                info={symbolInfos[f.symbol] ?? null}
                ticker={tickers.bySymbol.get(f.symbol) ?? null}
                quoteUpdatedAt={tickers.lastUpdatedAt}
                quoteError={quoteError}
                now={now}
                onRemoved={(symbol) => setFavorites((list) => list.filter((x) => x.symbol !== symbol))}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-20 text-center">
      <span
        className={
          tone === "error"
            ? "flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            : "flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {icon}
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}
