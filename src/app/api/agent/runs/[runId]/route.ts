import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { getRunDetail } from "@/lib/agent/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 只读：读取运行状态、步骤与 assistant 消息。GET 不会启动任何分析 */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await ctx.params;
  try {
    const detail = await getRunDetail(runId);
    if (!detail) return jsonError(404, "not_found", "运行不存在");
    return okJson(detail);
  } catch (err) {
    return errorResponse(err);
  }
}
