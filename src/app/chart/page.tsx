import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { ChartView } from "@/components/chart/chart-view";
import { Button } from "@/components/ui/button";
import { LoadingScene } from "@/components/ui/loading-scene";
import { getSymbol, normalizeSymbolParam } from "@/lib/binance/symbols";
import { BinanceError } from "@/lib/binance/client";
import { getFavorite } from "@/lib/favorites";
import { DEFAULT_SYMBOL, type PositionSide } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ChartPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rawSymbol = firstParam(sp.symbol);
  const requested = rawSymbol == null || rawSymbol.trim() === "" ? DEFAULT_SYMBOL : rawSymbol;
  const normalized = normalizeSymbolParam(requested);

  let info = null;
  let loadError: string | null = null;
  if (normalized) {
    try {
      info = await getSymbol(normalized);
    } catch (err) {
      loadError = err instanceof BinanceError ? err.message : "交易对信息加载失败";
    }
  }

  if (loadError) {
    return (
      <ErrorBlock title="无法加载交易对信息" description={`${loadError}。请稍后刷新重试。`} requested={requested} />
    );
  }
  if (!info) {
    return (
      <ErrorBlock
        title={`不支持的交易对：${requested.trim().toUpperCase() || "（空）"}`}
        description="本站仅支持币安现货中可交易的 USDT 交易对，例如 BTCUSDT、ETHUSDT。"
        requested={requested}
      />
    );
  }

  let favorite = false;
  let side: PositionSide | null = null;
  try {
    const row = await getFavorite(info.symbol);
    favorite = row != null;
    side = row?.side ?? null;
  } catch (err) {
    console.error("[chart] 读取收藏状态失败:", err instanceof Error ? err.message : err);
  }

  return (
    <Suspense fallback={<LoadingScene variant="page" className="mx-auto w-full max-w-6xl" />}>
      <ChartView key={info.symbol} info={info} initialFavorite={favorite} side={side} />
    </Suspense>
  );
}

function ErrorBlock({ title, description, requested }: { title: string; description: string; requested: string }) {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangleIcon className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold break-all">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button nativeButton={false} render={<Link href="/" />}>返回首页搜索</Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`/chart?symbol=${DEFAULT_SYMBOL}`} />}>
          查看 {DEFAULT_SYMBOL}
        </Button>
      </div>
      <p className="sr-only">请求的交易对：{requested}</p>
    </section>
  );
}
