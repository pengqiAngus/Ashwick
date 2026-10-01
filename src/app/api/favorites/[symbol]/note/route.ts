import type { NextRequest } from "next/server";
import { z } from "zod";
import { setNote } from "@/lib/favorites";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  note: z.string().max(2000).nullable(),
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
  if (!parsed.success) return jsonError(400, "bad_request", "备注不能超过 2000 字");

  const note = parsed.data.note?.trim() || null;

  try {
    const favorite = await setNote(symbol, note);
    if (!favorite) return jsonError(404, "not_found", "该交易对未被收藏，无法保存备注");
    return okJson({ favorite });
  } catch (err) {
    return errorResponse(err);
  }
}
