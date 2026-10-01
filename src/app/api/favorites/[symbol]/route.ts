import type { NextRequest } from "next/server";
import { removeFavorite } from "@/lib/favorites";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = normalizeSymbolParam(raw);
  if (!symbol) return jsonError(400, "bad_request", "交易对格式无效");
  try {
    const removed = await removeFavorite(symbol);
    if (!removed) return jsonError(404, "not_found", "该交易对未被收藏");
    return okJson({ symbol, removed: true });
  } catch (err) {
    return errorResponse(err);
  }
}
