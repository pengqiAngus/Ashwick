import type { NextRequest } from "next/server";
import { getKlines, KLINES_DEFAULT_LIMIT, KLINES_MAX_LIMIT } from "@/lib/binance/klines";
import { normalizeSymbolParam, requireSymbol } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { isKlineInterval, type KlinesResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbol = normalizeSymbolParam(sp.get("symbol"));
  const interval = sp.get("interval");
  const limitRaw = Number.parseInt(sp.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(KLINES_MAX_LIMIT, Math.max(1, limitRaw)) : KLINES_DEFAULT_LIMIT;

  if (!symbol) return jsonError(400, "bad_request", "缺少或无效的 symbol 参数");
  if (!isKlineInterval(interval)) return jsonError(400, "bad_request", "不支持的 K 线周期");

  try {
    const info = await requireSymbol(symbol);
    const candles = await getKlines(info.symbol, interval, limit);
    const body: KlinesResponse = { symbol: info.symbol, interval, candles, serverTime: Date.now() };
    return okJson(body);
  } catch (err) {
    return errorResponse(err);
  }
}
