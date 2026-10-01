import type { NextRequest } from "next/server";
import { z } from "zod";
import { setPositionSide } from "@/lib/favorites";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { POSITION_SIDES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  side: z.enum(POSITION_SIDES).nullable(),
});

export async function PUT(request: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await ctx.params;
  const symbol = normalizeSymbolParam(raw);
  if (!symbol) return jsonError(400, "bad_request", "交易对格式无效");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是有效的 JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_request", "开仓方向只能是开多或开空");

  try {
    const favorite = await setPositionSide(symbol, parsed.data.side);
    if (!favorite) return jsonError(404, "not_found", "该交易对未被收藏，无法设置开仓方向");
    return okJson({ favorite });
  } catch (err) {
    return errorResponse(err);
  }
}
