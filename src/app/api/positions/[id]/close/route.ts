import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { closePosition } from "@/lib/positions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: z.string(),
  unit: z.enum(["usdt", "base"]),
  closePrice: z.string(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return jsonError(400, "bad_request", "缺少仓位 id");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是有效的 JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_request", "平仓参数无效");

  try {
    const result = await closePosition(id, parsed.data);
    return okJson(result);
  } catch (err) {
    return errorResponse(err);
  }
}
