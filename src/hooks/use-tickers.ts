"use client";

import { useCallback, useMemo } from "react";
import { usePolling } from "@/hooks/use-polling";
import { apiFetch } from "@/lib/client-api";
import { publicEnv } from "@/lib/env";
import type { Ticker, TickersResponse } from "@/lib/types";

/** 批量轮询多个交易对的最新报价与 24 小时行情 */
export function useTickers(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!key) return { tickers: [], unknown: [], serverTime: Date.now() } satisfies TickersResponse;
      return apiFetch<TickersResponse>(`/api/tickers?symbols=${encodeURIComponent(key)}`, { signal });
    },
    [key],
  );
  const polling = usePolling(fetcher, { key, intervalMs: publicEnv.quoteRefreshMs, enabled: key.length > 0 });
  const bySymbol = useMemo(() => {
    const m = new Map<string, Ticker>();
    for (const t of polling.data?.tickers ?? []) m.set(t.symbol, t);
    return m;
  }, [polling.data]);
  return { ...polling, bySymbol };
}
