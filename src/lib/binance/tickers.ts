import { binanceGet } from "@/lib/binance/client";
import type { BinanceTicker24hr } from "@/lib/binance/types";
import { getSymbolTable } from "@/lib/binance/symbols";
import { isValidPriceString } from "@/lib/decimal";
import type { Ticker } from "@/lib/types";

/** 每批最多 20 个交易对，权重 2/批（21–100 个权重升至 40） */
const BATCH_SIZE = 20;
export const TICKERS_MAX_SYMBOLS = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toTicker(raw: BinanceTicker24hr, fetchedAt: number): Ticker | null {
  if (!isValidPriceString(raw.lastPrice)) return null;
  return {
    symbol: raw.symbol,
    lastPrice: raw.lastPrice,
    priceChange: typeof raw.priceChange === "string" ? raw.priceChange : "0",
    priceChangePercent: typeof raw.priceChangePercent === "string" ? raw.priceChangePercent : "0",
    fetchedAt,
  };
}

/**
 * 批量获取滚动 24 小时行情。
 * 先用交易对表过滤掉不可交易的交易对（否则整批请求会被币安以 -1121 拒绝）。
 */
export async function getTickers(symbols: string[]): Promise<{ tickers: Ticker[]; unknown: string[] }> {
  const unique = [...new Set(symbols)].slice(0, TICKERS_MAX_SYMBOLS);
  if (unique.length === 0) return { tickers: [], unknown: [] };

  const { bySymbol } = await getSymbolTable();
  const known = unique.filter((s) => bySymbol.has(s));
  const unknown = unique.filter((s) => !bySymbol.has(s));
  if (known.length === 0) return { tickers: [], unknown };

  const batches = await Promise.all(
    chunk(known, BATCH_SIZE).map((batch) =>
      binanceGet<BinanceTicker24hr[]>("api/v3/ticker/24hr", {
        symbols: JSON.stringify(batch),
        type: "FULL",
      }),
    ),
  );
  const fetchedAt = Date.now();
  const tickers: Ticker[] = [];
  for (const rows of batches) {
    for (const row of rows) {
      const t = toTicker(row, fetchedAt);
      if (t) tickers.push(t);
    }
  }
  return { tickers, unknown };
}
