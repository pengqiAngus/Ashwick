import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { getConversationView } from "@/lib/agent/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const view = await getConversationView(id);
    if (!view) return jsonError(404, "not_found", "会话不存在");
    return okJson(view);
  } catch (err) {
    return errorResponse(err);
  }
}
