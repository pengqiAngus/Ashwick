"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";
import { EntryDialog } from "@/components/favorites/entry-dialog";
import { FavoriteButton } from "@/components/favorite-button";
import { IntervalTabs } from "@/components/chart/interval-tabs";
import { ChangeText, PriceText } from "@/components/price/price-text";
import { LoadingScene } from "@/components/ui/loading-scene";
import { Skeleton } from "@/components/ui/skeleton";
import { SymbolSearch } from "@/components/search/symbol-search";
import { useTickers } from "@/hooks/use-tickers";
import { useNow } from "@/hooks/use-now";
import { publicEnv } from "@/lib/env";
import { formatPair, formatPrice, formatRelativeTime } from "@/lib/format";
import { errorMessage } from "@/lib/client-api";
import { DEFAULT_INTERVAL, isKlineInterval, writeStoredChartSymbol, type KlineInterval, type PositionSide, type SymbolInfo } from "@/lib/types";

const CandleChart = dynamic(() => import("@/components/chart/candle-chart").then((m) => m.CandleChart), {
  ssr: false,
  loading: () => <LoadingScene className="h-[clamp(320px,58vh,640px)]" />,
});

export function ChartView({ info, initialFavorite, side }: { info: SymbolInfo; initialFavorite: boolean; side: PositionSide | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramInterval = searchParams.get("interval");
  const [interval, setInterval] = useState<KlineInterval>(isKlineInterval(paramInterval) ? paramInterval : DEFAULT_INTERVAL);

  useEffect(() => {
    writeStoredChartSymbol(info.symbol);
  }, [info.symbol]);

  const onIntervalChange = useCallback(
    (iv: KlineInterval) => {
      setInterval(iv);
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("symbol", info.symbol);
      sp.set("interval", iv);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [info.symbol, pathname, router, searchParams],
  );

  const [positionSide, setPositionSide] = useState(side);
  const tickers = useTickers([info.symbol]);
  const ticker = tickers.bySymbol.get(info.symbol) ?? null;
  const now = useNow(1000);

  useEffect(() => {
    const price = ticker ? formatPrice(ticker.lastPrice, info.pricePrecision) : null;
    document.title = price && price !== "—" ? `${price} | ${info.baseAsset}` : "Ashwick";
    return () => {
      document.title = "Ashwick";
    };
  }, [ticker, info.baseAsset, info.pricePrecision]);
  const age = tickers.lastUpdatedAt == null ? null : now - tickers.lastUpdatedAt;
  const stale = age != null && age > publicEnv.quoteStaleMs;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <div className="flex justify-end">
        <SymbolSearch variant="compact" placeholder="切换交易对，例如 ETH、SOL" className="w-full sm:max-w-xs" />
      </div>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{formatPair(info.baseAsset, info.quoteAsset)}</span>
            <span aria-hidden>·</span>
            <span className="font-mono text-xs">{info.symbol}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {ticker ? (
              <PriceText value={ticker.lastPrice} precision={info.pricePrecision} className="text-3xl font-semibold tracking-tight sm:text-4xl" />
            ) : tickers.error ? (
              <span className="text-2xl font-semibold text-muted-foreground">—</span>
            ) : (
              <Skeleton className="h-9 w-40" />
            )}
            <div className="flex flex-col text-sm">
              <span className="text-xs text-muted-foreground">24 小时涨跌</span>
              {ticker ? (
                <ChangeText change={ticker.priceChange} changePercent={ticker.priceChangePercent} precision={info.pricePrecision} className="text-sm font-medium" />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
            {tickers.error && !ticker ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <AlertCircleIcon className="size-3.5" aria-hidden />
                {errorMessage(tickers.error, "行情获取失败")}
              </span>
            ) : age != null ? (
              <>
                更新于 {formatRelativeTime(age)}
                {stale && <span className="ml-2 text-destructive">行情已过期</span>}
                {tickers.error && <span className="ml-2 text-destructive">刷新失败，显示为历史报价</span>}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EntryDialog
            symbol={info.symbol}
            title={formatPair(info.baseAsset, info.quoteAsset)}
            baseAsset={info.baseAsset}
            side={positionSide}
            lastPrice={ticker?.lastPrice ?? null}
            buttonVariant="outline"
            buttonSize="default"
          />
          <FavoriteButton
            symbol={info.symbol}
            initialFavorite={initialFavorite}
            onChange={(fav) => {
              if (!fav) setPositionSide(null);
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <IntervalTabs value={interval} onChange={onIntervalChange} />
          <span className="text-xs text-muted-foreground">价格单位 USDT · 时间为本地时区</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card/60 shadow-(--shadow-panel)">
          <CandleChart symbol={info.symbol} interval={interval} pricePrecision={info.pricePrecision} />
        </div>
      </section>
    </div>
  );
}
