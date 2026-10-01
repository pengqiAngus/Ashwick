import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteMemo, updateMemo } from "@/lib/memos";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  body: z.string().max(2000),
});

async function readId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return id && id.length <= 64 ? id : null;
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readId(ctx);
  if (!id) return jsonError(400, "bad_request", "备注编号无效");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是有效的 JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_request", "备注不能超过 2000 字");

  try {
    const memo = await updateMemo(id, parsed.data.body);
    if (!memo) return jsonError(404, "not_found", "备注不存在");
    return okJson({ memo });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readId(ctx);
  if (!id) return jsonError(400, "bad_request", "备注编号无效");
  try {
    const removed = await deleteMemo(id);
    if (!removed) return jsonError(404, "not_found", "备注不存在");
    return okJson({ id, removed: true });
  } catch (err) {
    return errorResponse(err);
  }
}
