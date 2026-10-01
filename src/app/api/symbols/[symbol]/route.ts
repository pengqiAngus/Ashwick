import type { NextRequest } from "next/server";
import { getSymbol, normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const normalized = normalizeSymbolParam(symbol);
  if (!normalized) return jsonError(400, "bad_request", "交易对格式无效");
  try {
    const info = await getSymbol(normalized);
    if (!info) return jsonError(404, "not_found", `不支持的交易对：${normalized}`);
    return okJson(info, { cacheControl: "private, max-age=60" });
  } catch (err) {
    return errorResponse(err);
  }
}
