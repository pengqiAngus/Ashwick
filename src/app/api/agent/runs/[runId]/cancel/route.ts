import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { requestCancel } from "@/lib/agent/persistence";
import { abortRun } from "@/lib/agent/run-registry";
import type { CancelResponse } from "@/lib/agent/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 停止运行：数据库标记 cancelling（跨实例生效），同进程立即 abort。
 * 幂等：已终态的运行返回其当前状态。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await ctx.params;
  try {
    const status = await requestCancel(runId);
    if (!status) return jsonError(404, "not_found", "运行不存在");
    abortRun(runId);
    const res: CancelResponse = { runId, status };
    return okJson(res);
  } catch (err) {
    return errorResponse(err);
  }
}
