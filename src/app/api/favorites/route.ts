import type { NextRequest } from "next/server";
import { z } from "zod";
import { addFavorite, listFavorites } from "@/lib/favorites";
import { normalizeSymbolParam } from "@/lib/binance/symbols";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return okJson({ favorites: await listFavorites() });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({ symbol: z.string().min(2).max(24) });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是有效的 JSON");
  }
  const parsed = createSchema.safeParse(body);
  const symbol = parsed.success ? normalizeSymbolParam(parsed.data.symbol) : null;
  if (!symbol) return jsonError(400, "bad_request", "交易对格式无效");

  try {
    const favorite = await addFavorite(symbol);
    return okJson({ favorite }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
