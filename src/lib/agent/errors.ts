import type { ApiErrorKind } from "@/lib/types";

/** Agent 模块抛出的、可直接映射为 HTTP 响应的错误 */
export class AgentError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly details?: Record<string, unknown>;

  constructor(status: number, kind: ApiErrorKind, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AgentError";
    this.status = status;
    this.kind = kind;
    this.details = details;
  }
}

/** claim 阶段的乐观并发冲突：消息已被占用或会话已有活跃运行 */
export class ClaimConflict extends Error {
  readonly reason: "message" | "conversation";
  constructor(reason: "message" | "conversation") {
    super(reason === "message" ? "该消息已被处理或正在处理" : "该对话已有正在进行的分析");
    this.name = "ClaimConflict";
    this.reason = reason;
  }
}

/** Prisma 唯一约束冲突（P2002）。可选地按目标字段过滤 */
export function isP2002(err: unknown, target?: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== "P2002") return false;
  if (!target) return true;
  const t = e.meta?.target;
  if (Array.isArray(t)) return t.some((x) => String(x).includes(target));
  if (typeof t === "string") return t.includes(target);
  // 部分驱动只给出约束名，无法判断时按“是 P2002”处理
  return true;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
