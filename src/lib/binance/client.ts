import { serverEnv } from "@/lib/env";
import type { ApiErrorKind } from "@/lib/types";
import type { BinanceErrorBody } from "@/lib/binance/types";

export class BinanceError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly retryAfterSec?: number;
  readonly binanceCode?: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    extra: { status?: number; retryAfterSec?: number; binanceCode?: number } = {},
  ) {
    super(message);
    this.name = "BinanceError";
    this.kind = kind;
    this.status = extra.status;
    this.retryAfterSec = extra.retryAfterSec;
    this.binanceCode = extra.binanceCode;
  }
}

/** 进程内的限流状态：被 429/418 后在 Retry-After 之内不再请求币安 */
const state = globalThis as unknown as { __binanceRateLimitedUntil?: number };

function rateLimitedUntil(): number {
  return state.__binanceRateLimitedUntil ?? 0;
}

function markRateLimited(retryAfterSec: number): void {
  state.__binanceRateLimitedUntil = Math.max(rateLimitedUntil(), Date.now() + retryAfterSec * 1000);
}

function parseRetryAfter(res: Response, fallbackSec: number): number {
  const raw = res.headers.get("retry-after");
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallbackSec;
}

async function readErrorBody(res: Response): Promise<BinanceErrorBody | null> {
  try {
    const j = (await res.json()) as Partial<BinanceErrorBody>;
    if (typeof j?.code === "number" && typeof j?.msg === "string") return j as BinanceErrorBody;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 请求币安现货公开接口。
 * - 统一超时、`cache: no-store`
 * - 429/418 读取 Retry-After 并在本进程内记住限流截止时间
 * - 451 视为地区不可用，5xx 视为服务不可用
 */
export async function binanceGet<T>(
  path: string,
  params: Record<string, string> = {},
  init: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  if (init.signal?.aborted) {
    throw new DOMException("请求已取消", "AbortError");
  }
  const until = rateLimitedUntil();
  if (Date.now() < until) {
    throw new BinanceError("rate_limited", "本地限流保护中", {
      status: 429,
      retryAfterSec: Math.max(1, Math.ceil((until - Date.now()) / 1000)),
    });
  }

  const url = new URL(path, serverEnv.binanceBaseUrl + "/");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const timeoutSignal = AbortSignal.timeout(init.timeoutMs ?? serverEnv.binanceTimeoutMs);
  const signal = init.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    // 调用方主动取消：原样抛出 AbortError，交由上层区分“取消”与“超时”
    if (init.signal?.aborted) {
      throw new DOMException("请求已取消", "AbortError");
    }
    if (name === "TimeoutError" || name === "AbortError") {
      throw new BinanceError("timeout", "请求币安接口超时");
    }
    throw new BinanceError("network", "无法连接币安接口");
  }

  if (res.ok) {
    return (await res.json()) as T;
  }

  if (res.status === 429 || res.status === 418) {
    const retryAfterSec = parseRetryAfter(res, res.status === 418 ? 120 : 60);
    markRateLimited(retryAfterSec);
    throw new BinanceError(
      res.status === 418 ? "banned" : "rate_limited",
      res.status === 418 ? "IP 已被币安临时封禁" : "已触发币安请求限流",
      { status: res.status, retryAfterSec },
    );
  }
  if (res.status === 451) {
    throw new BinanceError("geo_blocked", "当前部署地区无法访问币安接口", { status: 451 });
  }
  if (res.status === 403) {
    throw new BinanceError("unavailable", "币安接口拒绝了请求（WAF）", { status: 403 });
  }
  if (res.status >= 500) {
    throw new BinanceError("unavailable", "币安服务暂时不可用", { status: res.status });
  }

  const body = await readErrorBody(res);
  // -1121: Invalid symbol; -1100/-1102/-1104: 参数错误
  if (body?.code === -1121) {
    throw new BinanceError("not_found", "不支持的交易对", { status: 404, binanceCode: body.code });
  }
  throw new BinanceError("bad_request", body?.msg ?? `币安接口返回 HTTP ${res.status}`, {
    status: res.status,
    binanceCode: body?.code,
  });
}
