import { after } from "next/server";
import { errorResponse, jsonError } from "@/lib/api-error";
import { agentSettings, loadAgentSettings } from "@/lib/agent/settings";
import { ClaimConflict } from "@/lib/agent/errors";
import { startRun } from "@/lib/agent/orchestrator";
import * as db from "@/lib/agent/persistence";
import { isModelConfigured } from "@/lib/agent/provider";
import { chatBodySchema, DEFAULT_AGENT_INTERVALS, DEFAULT_HORIZON, horizonSchema, klineIntervalSchema, type RunConfig, type RunKind } from "@/lib/agent/schemas";
import { createRunStreamResponse } from "@/lib/agent/stream";
import type { Message } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is { type: "text"; text: string } => typeof p === "object" && p != null && (p as { type?: unknown }).type === "text" && typeof (p as { text?: unknown }).text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/**
 * 发送消息并返回流式响应。两种模式：
 * - 模式 A：{ conversationId, pendingMessageId } 启动已存在的待处理消息（卡片 / 空白页首条、重试）
 * - 模式 B：{ conversationId, message } 持久化新用户消息后启动
 * 同一条消息只会启动一次；会话同时只允许一个运行；冲突返回 409。
 */
export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError(400, "bad_request", "请求体不是合法 JSON");
  }
  const parsed = chatBodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "validation", "请求参数无效");
  const body = parsed.data;

  try {
    const conversation = await db.getConversation(body.conversationId);
    if (!conversation) return jsonError(404, "not_found", "会话不存在");

    let userMessage: Message | null;
    await loadAgentSettings();
    const maxChars = agentSettings().maxInputChars;
    if ("pendingMessageId" in body) {
      userMessage = await db.getMessage(body.pendingMessageId);
      if (!userMessage || userMessage.conversationId !== conversation.id || userMessage.role !== "user") {
        return jsonError(404, "not_found", "待处理消息不存在");
      }
    } else {
      if (body.message.role !== "user") return jsonError(400, "validation", "只能发送用户消息");
      const text = textOf(body.message.parts);
      if (!text) return jsonError(400, "validation", "消息不能为空");
      if (text.length > maxChars) return jsonError(400, "validation", `消息过长（最多 ${maxChars} 字）`);
      // 只保存文本 part：不接受客户端伪造的工具结果 / 数据 part 作为事实
      userMessage = await db.persistUserMessage(conversation.id, { id: body.message.id, parts: [{ type: "text", text }] });
    }
    if (!isModelConfigured()) {
      return jsonError(503, "model_unavailable", "尚未配置模型服务：请在 Agent 设置或环境变量中填写 AI_PROVIDER_BASE_URL、AI_PROVIDER_API_KEY 与 AI_MODEL_ANALYST", {
        details: { messageId: userMessage.id },
      });
    }

    const question = textOf(userMessage.parts);
    const intervals = conversation.currentIntervals.filter((x) => klineIntervalSchema.safeParse(x).success) as RunConfig["intervals"];
    const horizon = horizonSchema.safeParse(conversation.currentHorizon);
    const isLaunch = userMessage.ordinal === 0 && conversation.source === "favorite_card" && conversation.currentSymbol;
    const kind: RunKind = isLaunch ? "full_analysis" : "undetermined";
    const config: RunConfig = {
      symbol: conversation.currentSymbol,
      intervals: intervals.length ? intervals : DEFAULT_AGENT_INTERVALS,
      horizon: horizon.success ? horizon.data : DEFAULT_HORIZON,
      targetRange: null,
      question,
      baseReportId: null,
      hypothesis: null,
    };

    let claim: db.ClaimResult;
    try {
      claim = await db.claimRun({ conversationId: conversation.id, messageId: userMessage.id, kind, config });
    } catch (err) {
      if (!(err instanceof ClaimConflict)) throw err;
      // 活跃运行可能是崩溃遗留：回收后重试一次
      const reaped = await db.reapOrphanForConversation(conversation.id);
      if (!reaped) return conflictResponse(conversation.id, userMessage.id);
      try {
        claim = await db.claimRun({ conversationId: conversation.id, messageId: userMessage.id, kind, config });
      } catch (err2) {
        if (!(err2 instanceof ClaimConflict)) throw err2;
        return conflictResponse(conversation.id, userMessage.id);
      }
    }

    const { handle, promise } = startRun({ run: claim.run, userMessage: claim.userMessage, assistantMessage: claim.assistantMessage, conversation, question, config });
    after(() => promise);
    return createRunStreamResponse(handle, {
      runId: claim.run.id,
      assistantMessageId: claim.assistantMessage.id,
      metadata: { runId: claim.run.id, kind, createdAt: claim.assistantMessage.createdAt.toISOString(), status: "running" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function conflictResponse(conversationId: string, messageId: string): Promise<Response> {
  const info = await db.describeConflict(conversationId, messageId);
  if (info.kind === "active_run") {
    return jsonError(409, "conflict", "该对话已有正在进行的分析", { details: { runId: info.run.runId, status: info.run.status, assistantMessageId: info.run.assistantMessageId } });
  }
  if (info.kind === "message_done") {
    return jsonError(409, "conflict", "该消息已处理", { details: { runId: info.runId, messageStatus: info.messageStatus } });
  }
  return jsonError(409, "conflict");
}
