import Link from "next/link";
import { PositionsBoard } from "@/components/positions/positions-board";
import { getSymbolTable } from "@/lib/binance/symbols";
import { listOpenPositions } from "@/lib/positions";
import type { PositionDto, SymbolInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  let positions: PositionDto[] = [];
  let loadError: string | null = null;
  try {
    positions = await listOpenPositions();
  } catch (err) {
    console.error("[positions] 读取仓位失败:", err instanceof Error ? err.message : err);
    loadError = "数据库暂时不可用，请确认 PostgreSQL 已启动并完成迁移后刷新页面。";
  }

  const symbolInfos: Record<string, SymbolInfo> = {};
  if (positions.length > 0 && !loadError) {
    try {
      const { bySymbol } = await getSymbolTable();
      for (const row of positions) {
        const info = bySymbol.get(row.symbol);
        if (info) symbolInfos[row.symbol] = info;
      }
    } catch (err) {
      console.warn("[positions] 交易对信息加载失败:", err instanceof Error ? err.message : err);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">仓位</h1>
        <p className="text-sm text-muted-foreground">
          未平仓位按当前价格计算盈亏。平仓记录在{" "}
          <Link href="/records" className="text-foreground underline-offset-4 hover:underline">
            记录
          </Link>
          页。
        </p>
      </header>
      <PositionsBoard positions={positions} symbolInfos={symbolInfos} loadError={loadError} />
    </div>
  );
}
