import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { LEVERAGE_MAX, LEVERAGE_MIN } from "@/lib/position-math";
import { openPosition } from "@/lib/positions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  symbol: z.string(),
  side: z.enum(["long", "short"]),
  baseQty: z.string(),
  leverage: z.number().int().min(LEVERAGE_MIN).max(LEVERAGE_MAX),
  entryPrice: z.string(),
});

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是有效的 JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_request", "开仓参数无效");

  const symbol = normalizeSymbolParam(parsed.data.symbol);
  if (!symbol) return jsonError(400, "bad_request", "交易对格式无效");

  try {
    const position = await openPosition({ ...parsed.data, symbol });
    return okJson({ position }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
