import { z } from "zod";
import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { getAgentSettingsPublic, resetAgentSettings, saveAgentSettings } from "@/lib/agent/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  providerName: z.string().max(80),
  providerBaseUrl: z.string().max(500),
  apiKey: z.string().max(500).optional(),
  modelAnalyst: z.string().max(200),
  modelSynth: z.string().max(200),
  supportsStructuredOutputs: z.boolean(),
  maxRunMs: z.number().int().min(30_000),
  maxModelCalls: z.number().int().min(1),
  debateRounds: z.number().int().min(1),
  maxInputChars: z.number().int().min(200),
  riskMode: z.enum(["fast", "deep"]),
});

export async function GET() {
  try {
    return okJson(await getAgentSettingsPublic());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是合法 JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "validation", "配置无效：运行时限不少于 30000 毫秒，调用次数、辩论轮数至少为 1，输入字数至少 200");
  try {
    return okJson(await saveAgentSettings(parsed.data));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("模型服务地址")) return jsonError(400, "validation", err.message);
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    return okJson(await resetAgentSettings());
  } catch (err) {
    return errorResponse(err);
  }
}
