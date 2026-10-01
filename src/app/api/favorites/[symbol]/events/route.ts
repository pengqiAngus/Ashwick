import { listFavoriteEvents } from "@/lib/favorites";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = normalizeSymbolParam(raw);
  if (!symbol) return jsonError(400, "bad_request", "交易对格式无效");

  try {
    const events = await listFavoriteEvents(symbol);
    if (!events) return jsonError(404, "not_found", "该交易对未被收藏");
    return okJson({ events });
  } catch (err) {
    return errorResponse(err);
  }
}
