import type { RunEvent } from "@/lib/agent/events";

export interface RunHandle {
  runId: string;
  controller: AbortController;
  buffer: RunEvent[];
  listeners: Set<(ev: RunEvent) => void>;
  done: boolean;
  createdAt: number;
}

/** 进程内运行注册表：挂在 globalThis 上以在开发热更新间保持 */
const store = globalThis as unknown as { __agentRuns?: Map<string, RunHandle> };
function map(): Map<string, RunHandle> {
  if (!store.__agentRuns) store.__agentRuns = new Map();
  return store.__agentRuns;
}

const HANDLE_TTL_MS = 10 * 60_000;

export function registerRun(runId: string): RunHandle {
  const handle: RunHandle = { runId, controller: new AbortController(), buffer: [], listeners: new Set(), done: false, createdAt: Date.now() };
  map().set(runId, handle);
  sweep();
  return handle;
}

export function getRun(runId: string): RunHandle | undefined {
  return map().get(runId);
}

export function publish(handle: RunHandle, ev: RunEvent): void {
  handle.buffer.push(ev);
  if (ev.type === "done") handle.done = true;
  for (const fn of [...handle.listeners]) {
    try {
      fn(ev);
    } catch {
      handle.listeners.delete(fn);
    }
  }
}

/** 订阅：先回放已缓冲事件，再接收后续事件；返回退订函数 */
export function subscribe(handle: RunHandle, fn: (ev: RunEvent) => void): () => void {
  for (const ev of handle.buffer) fn(ev);
  if (handle.done) return () => {};
  handle.listeners.add(fn);
  return () => handle.listeners.delete(fn);
}

/** 请求取消：仅同进程有效；跨进程通过数据库 status=cancelling 传递 */
export function abortRun(runId: string, reason = "cancelled"): boolean {
  const h = map().get(runId);
  if (!h || h.done) return false;
  h.controller.abort(new DOMException(reason, "AbortError"));
  return true;
}

function sweep(): void {
  const now = Date.now();
  for (const [id, h] of map()) {
    if (h.done && now - h.createdAt > HANDLE_TTL_MS) map().delete(id);
  }
}
