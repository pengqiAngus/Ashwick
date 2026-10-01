import type { NextRequest } from "next/server";
import { z } from "zod";
import { createMemo, listMemos } from "@/lib/memos";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return okJson({ memos: await listMemos() });
  } catch (err) {
    return errorResponse(err);
  }
}

const bodySchema = z.object({
  body: z.string().max(2000),
});

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是有效的 JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_request", "备注不能超过 2000 字");

  try {
    const memo = await createMemo(parsed.data.body);
    return okJson({ memo }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
