import { errorResponse, jsonError, okJson } from "@/lib/api-error";
import { normalizeSymbolParam, requireSymbol } from "@/lib/binance/symbols";
import { getDb } from "@/lib/db";
import { toPlainString } from "@/lib/decimal";
import { agentSettings, loadAgentSettings } from "@/lib/agent/settings";
import { createLaunchConversation } from "@/lib/agent/persistence";
import { buildLaunchPrompt, conversationTitle } from "@/lib/agent/prompts";
import { createConversationBodySchema, DEFAULT_AGENT_INTERVALS, DEFAULT_HORIZON, type CreateConversationResponse } from "@/lib/agent/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 创建会话 + 首条待运行的用户消息。收藏卡片与空白页共用；launchId 保证幂等。
 * 本接口不启动分析。
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是合法 JSON");
  }
  const parsed = createConversationBodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "validation", "请求参数无效");
  const body = parsed.data;

  try {
    let text: string;
    let symbol: string | null = null;
    let title: string;
    if (body.source === "favorite_card") {
      const sym = normalizeSymbolParam(body.symbol);
      if (!sym) return jsonError(400, "bad_request", "交易对格式无效");
      const info = await requireSymbol(sym);
      const fav = await getDb().favorite.findUnique({ where: { symbol: info.symbol } });
      if (!fav) return jsonError(404, "not_found", `${info.symbol} 尚未收藏`);
      const range = fav.targetLow != null && fav.targetHigh != null ? { low: toPlainString(fav.targetLow.toFixed()), high: toPlainString(fav.targetHigh.toFixed()) } : null;
      text = buildLaunchPrompt(info, range, DEFAULT_HORIZON, fav.side);
      symbol = info.symbol;
      title = `${info.symbol} 走势分析`;
    } else {
      text = body.text.trim();
      if (!text) return jsonError(400, "validation", "消息不能为空");
      await loadAgentSettings();
      const maxChars = agentSettings().maxInputChars;
      if (text.length > maxChars) return jsonError(400, "validation", `消息过长（最多 ${maxChars} 字）`);
      title = conversationTitle(text);
    }
    const result = await createLaunchConversation({
      source: body.source,
      launchId: body.launchId,
      text,
      symbol,
      intervals: DEFAULT_AGENT_INTERVALS,
      horizon: DEFAULT_HORIZON,
      title,
    });
    const res: CreateConversationResponse = result;
    return okJson(res, { status: result.created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
