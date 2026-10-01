"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, isAbortError } from "@/lib/client-api";
import { RUN_TERMINAL_STATUSES, type RunDetail } from "@/lib/agent/schemas";

/**
 * 轮询运行状态直到终态。用于：刷新页面时恢复正在进行的运行、409 冲突后跟随已有运行、断流后恢复。
 * GET 请求只读，不会触发新的分析。
 */
export function useRunPoll(runId: string | null, onUpdate: (detail: RunDetail) => void, intervalMs = 1500): { polling: boolean; error: string | null } {
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!runId) {
      setPolling(false);
      return;
    }
    let disposed = false;
    let timer: number | null = null;
    const controller = new AbortController();
    setPolling(true);
    setError(null);

    const tick = async () => {
      if (disposed) return;
      try {
        const detail = await apiFetch<RunDetail>(`/api/agent/runs/${encodeURIComponent(runId)}`, { signal: controller.signal });
        if (disposed) return;
        onUpdateRef.current(detail);
        if ((RUN_TERMINAL_STATUSES as string[]).includes(detail.run.status)) {
          setPolling(false);
          return;
        }
        timer = window.setTimeout(tick, document.visibilityState === "hidden" ? intervalMs * 3 : intervalMs);
      } catch (err) {
        if (disposed || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : "读取运行状态失败");
        timer = window.setTimeout(tick, intervalMs * 3);
      }
    };
    void tick();
    return () => {
      disposed = true;
      controller.abort();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [runId, intervalMs]);

  return { polling, error };
}
