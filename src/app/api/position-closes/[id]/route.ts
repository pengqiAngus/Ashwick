import type { NextRequest } from "next/server";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { deletePositionClose } from "@/lib/positions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return id && id.length <= 64 ? id : null;
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readId(ctx);
  if (!id) return jsonError(400, "bad_request", "平仓记录编号无效");
  try {
    const removed = await deletePositionClose(id);
    if (!removed) return jsonError(404, "not_found", "平仓记录不存在");
    return okJson({ id, removed: true });
  } catch (err) {
    return errorResponse(err);
  }
}
