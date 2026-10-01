import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import { MemoSidebar } from "@/components/favorites/memo-sidebar";
import { NotificationStatus } from "@/components/favorites/notification-status";
import { getSymbolTable } from "@/lib/binance/symbols";
import { listFavorites } from "@/lib/favorites";
import { listMemos } from "@/lib/memos";
import type { FavoriteDto, MemoDto, SymbolInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  let favorites: FavoriteDto[] = [];
  let memos: MemoDto[] = [];
  let loadError: string | null = null;
  let memoError: string | null = null;
  try {
    favorites = await listFavorites();
  } catch (err) {
    console.error("[favorites] 读取收藏失败:", err instanceof Error ? err.message : err);
    loadError = "数据库暂时不可用，请确认 PostgreSQL 已启动并完成迁移后刷新页面。";
  }
  try {
    memos = await listMemos();
  } catch (err) {
    console.error("[favorites] 读取备注失败:", err instanceof Error ? err.message : err);
    memoError = "备注暂时无法读取，请确认数据库已完成迁移后刷新页面。";
  }

  const symbolInfos: Record<string, SymbolInfo> = {};
  if (favorites.length > 0) {
    try {
      const { bySymbol } = await getSymbolTable();
      for (const f of favorites) {
        const info = bySymbol.get(f.symbol);
        if (info) symbolInfos[f.symbol] = info;
      }
    } catch (err) {
      // 交易对表不可用时仍渲染卡片，价格精度退回默认值
      console.warn("[favorites] 交易对信息加载失败:", err instanceof Error ? err.message : err);
      for (const f of favorites) {
        symbolInfos[f.symbol] = { symbol: f.symbol, baseAsset: f.baseAsset, quoteAsset: f.quoteAsset, tickSize: "0.01", pricePrecision: 2 };
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
      <header className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Favorite</h1>
          <p className="text-sm text-muted-foreground">收藏的 USDT 现货交易对，可设置开多或开空，以及目标价格区间。</p>
        </div>
        <div className="flex items-center gap-2">
          <MemoSidebar initialMemos={memos} loadError={memoError} />
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/agent" />} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <SparklesIcon aria-hidden />
            打开 Agent
          </Button>
        </div>
      </header>
      <NotificationStatus />
      <FavoritesGrid initialFavorites={favorites} symbolInfos={symbolInfos} loadError={loadError} />
    </div>
  );
}
