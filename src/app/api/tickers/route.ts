import type { NextRequest } from "next/server";
import { getTickers, TICKERS_MAX_SYMBOLS } from "@/lib/binance/tickers";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import type { TickersResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => normalizeSymbolParam(s))
    .filter((s): s is string => s != null);

  if (symbols.length === 0) return jsonError(400, "bad_request", "缺少 symbols 参数");
  if (symbols.length > TICKERS_MAX_SYMBOLS) {
    return jsonError(400, "bad_request", `单次最多查询 ${TICKERS_MAX_SYMBOLS} 个交易对`);
  }

  try {
    const { tickers, unknown } = await getTickers(symbols);
    const body: TickersResponse = { tickers, unknown, serverTime: Date.now() };
    return okJson(body);
  } catch (err) {
    return errorResponse(err);
  }
}
