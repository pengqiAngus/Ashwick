import { BinanceError } from "@/lib/binance/client";
import { FavoriteError } from "@/lib/favorites";
import { MemoError } from "@/lib/memos";
import { PositionError } from "@/lib/positions";
import { AgentError } from "@/lib/agent/errors";
import type { ApiErrorBody, ApiErrorKind } from "@/lib/types";

const MESSAGES: Record<ApiErrorKind, string> = {
  rate_limited: "请求过于频繁，已触发币安限流，请稍后重试",
  banned: "IP 已被币安临时封禁，请稍后再试",
  geo_blocked: "当前部署地区无法访问币安接口（HTTP 451）",
  unavailable: "币安服务暂时不可用",
  timeout: "请求币安接口超时",
  network: "无法连接币安接口，请检查网络",
  not_found: "不支持的交易对",
  bad_request: "请求参数无效",
  conflict: "存在冲突的操作，请刷新后重试",
  validation: "输入内容不符合要求",
  model_unavailable: "AI 模型服务暂时不可用或未配置",
  internal: "服务器内部错误",
};

export function jsonError(
  status: number,
  kind: ApiErrorKind,
  message = MESSAGES[kind],
  extra: { retryAfterSec?: number; details?: Record<string, unknown> } = {},
): Response {
  const body: ApiErrorBody = { error: { kind, message, ...extra } };
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (extra.retryAfterSec) headers["retry-after"] = String(extra.retryAfterSec);
  return Response.json(body, { status, headers });
}

/** 把服务端抛出的任意错误映射为统一 JSON 响应 */
export function errorResponse(err: unknown): Response {
  if (err instanceof BinanceError) {
    switch (err.kind) {
      case "rate_limited":
        return jsonError(429, "rate_limited", `${MESSAGES.rate_limited}（约 ${err.retryAfterSec ?? 60} 秒）`, {
          retryAfterSec: err.retryAfterSec ?? 60,
        });
      case "banned":
        return jsonError(503, "banned", MESSAGES.banned, { retryAfterSec: err.retryAfterSec ?? 120 });
      case "geo_blocked":
        return jsonError(503, "geo_blocked");
      case "timeout":
        return jsonError(504, "timeout");
      case "network":
        return jsonError(502, "network");
      case "unavailable":
        return jsonError(503, "unavailable");
      case "not_found":
        return jsonError(404, "not_found", err.message);
      default:
        return jsonError(400, "bad_request", err.message);
    }
  }
  if (err instanceof AgentError) {
    return jsonError(err.status, err.kind, err.message, { details: err.details });
  }
  if (err instanceof FavoriteError || err instanceof MemoError || err instanceof PositionError) {
    return jsonError(err.status, err.status === 404 ? "not_found" : "bad_request", err.message);
  }
  console.error("[api] 未处理的错误:", err);
  const isDbError = err instanceof Error && /DATABASE_URL|ECONNREFUSED|connect|prisma/i.test(err.message);
  return jsonError(500, "internal", isDbError ? "数据库连接失败，请确认 PostgreSQL 已启动并完成迁移" : MESSAGES.internal);
}

export function okJson<T>(data: T, init: { cacheControl?: string; status?: number } = {}): Response {
  return Response.json(data, {
    status: init.status ?? 200,
    headers: { "cache-control": init.cacheControl ?? "no-store" },
  });
}
