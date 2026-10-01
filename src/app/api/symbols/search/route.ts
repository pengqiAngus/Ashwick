import type { NextRequest } from "next/server";
import { listPopularSymbols, searchSymbols } from "@/lib/binance/symbols";
import { getTickers } from "@/lib/binance/tickers";
import { errorResponse, okJson } from "@/lib/api-error";
import type { SearchHit, SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 32);
  try {
    const found = q ? await searchSymbols(q, 10) : await listPopularSymbols();
    const prices = new Map<string, { lastPrice: string; priceChangePercent: string }>();
    if (found.length) {
      try {
        const { tickers } = await getTickers(found.map((item) => item.symbol));
        for (const ticker of tickers) {
          prices.set(ticker.symbol, { lastPrice: ticker.lastPrice, priceChangePercent: ticker.priceChangePercent });
        }
      } catch (err) {
        console.warn("[search] 行情获取失败，列表仍返回交易对:", err instanceof Error ? err.message : err);
      }
    }
    const results: SearchHit[] = found.map((item) => {
      const price = prices.get(item.symbol);
      return {
        ...item,
        lastPrice: price?.lastPrice ?? null,
        priceChangePercent: price?.priceChangePercent ?? null,
      };
    });
    const body: SearchResponse = { query: q, results };
    return okJson(body);
  } catch (err) {
    return errorResponse(err);
  }
}
