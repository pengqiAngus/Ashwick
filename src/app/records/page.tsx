import { RecordsView } from "@/components/records/records-view";
import { getSymbolTable } from "@/lib/binance/symbols";
import { listPositionCloses } from "@/lib/positions";
import type { PositionCloseDto, SymbolInfo } from "@/lib/types";
import { AlertCircleIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  let closes: PositionCloseDto[] = [];
  let loadError: string | null = null;
  try {
    closes = await listPositionCloses();
  } catch (err) {
    console.error("[records] 读取平仓记录失败:", err instanceof Error ? err.message : err);
    loadError = "数据库暂时不可用，请确认 PostgreSQL 已启动并完成迁移后刷新页面。";
  }

  const symbolInfos: Record<string, SymbolInfo> = {};
  if (closes.length > 0 && !loadError) {
    try {
      const { bySymbol } = await getSymbolTable();
      for (const row of closes) {
        const info = bySymbol.get(row.symbol);
        if (info) symbolInfos[row.symbol] = info;
      }
    } catch (err) {
      console.warn("[records] 交易对信息加载失败:", err instanceof Error ? err.message : err);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">记录</h1>
        <p className="text-sm text-muted-foreground">已平仓的实际盈亏。日期按东八区日历日筛选，全部币种按 USDT 相加。</p>
      </header>
      {loadError ? (
        <section className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
          <AlertCircleIcon className="size-6 text-destructive" aria-hidden />
          <h2 className="text-lg font-semibold">无法读取平仓记录</h2>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </section>
      ) : (
        <RecordsView closes={closes} now={Date.now()} symbolInfos={symbolInfos} />
      )}
    </div>
  );
}
