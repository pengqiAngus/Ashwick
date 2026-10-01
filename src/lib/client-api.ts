import type { ApiErrorBody, ApiErrorKind } from "@/lib/types";

/** 客户端调用本站 API 时的统一错误 */
export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly retryAfterSec?: number;
  readonly details?: Record<string, unknown>;

  constructor(kind: ApiErrorKind, message: string, status: number, retryAfterSec?: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
    this.details = details;
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export async function apiFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      cache: "no-store",
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiClientError("network", "网络连接失败，请检查网络后重试", 0);
  }

  if (res.ok) {
    return (await res.json()) as T;
  }

  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* ignore */
  }
  const kind = body?.error?.kind ?? (res.status === 404 ? "not_found" : res.status >= 500 ? "unavailable" : "bad_request");
  const message = body?.error?.message ?? `请求失败（HTTP ${res.status}）`;
  throw new ApiClientError(kind, message, res.status, body?.error?.retryAfterSec, body?.error?.details);
}

export function errorMessage(err: unknown, fallback = "操作失败，请稍后重试"): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
