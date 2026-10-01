"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, isAbortError } from "@/lib/client-api";

export interface PollingState<T> {
  data: T | null;
  error: Error | null;
  /** 最近一次成功获取数据的时间戳（毫秒） */
  lastUpdatedAt: number | null;
  isFetching: boolean;
  refresh: () => void;
}

interface Options {
  /** 正常刷新间隔（毫秒） */
  intervalMs: number;
  /** 变化时重置数据并重新开始轮询 */
  key: string;
  enabled?: boolean;
}

/**
 * 可见性感知的轮询：
 * - setTimeout 链而非 setInterval，请求不会重叠
 * - 页面隐藏时暂停；重新可见时立即刷新一次
 * - 收到限流（retryAfterSec）时按提示延后，不做无限快速重试
 */
export function usePolling<T>(fetcher: (signal: AbortSignal) => Promise<T>, options: Options): PollingState<T> {
  const { intervalMs, key, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const timerRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const runIdRef = useRef(0);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const runId = ++runIdRef.current;
    let disposed = false;

    setData(null);
    setError(null);
    setLastUpdatedAt(null);

    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (disposed || document.visibilityState === "hidden") return;
      timerRef.current = window.setTimeout(run, delayMs);
    };

    const run = async () => {
      if (disposed || inFlightRef.current) return;
      inFlightRef.current = true;
      setIsFetching(true);
      const controller = new AbortController();
      controllerRef.current = controller;
      let nextDelay = intervalMs;
      try {
        const result = await fetcherRef.current(controller.signal);
        if (disposed || runId !== runIdRef.current) return;
        setData(result);
        setError(null);
        setLastUpdatedAt(Date.now());
      } catch (err) {
        if (disposed || runId !== runIdRef.current || isAbortError(err)) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        if (err instanceof ApiClientError && err.retryAfterSec) {
          nextDelay = Math.max(intervalMs, err.retryAfterSec * 1000);
        } else {
          // 连续失败时适度放慢，避免对不可用的接口持续施压
          nextDelay = Math.max(intervalMs, 10_000);
        }
      } finally {
        inFlightRef.current = false;
        if (!disposed && runId === runIdRef.current) {
          setIsFetching(false);
          schedule(nextDelay);
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clearTimer();
        void run();
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    void run();

    return () => {
      disposed = true;
      clearTimer();
      controllerRef.current?.abort();
      inFlightRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, intervalMs, enabled, tick]);

  return { data, error, lastUpdatedAt, isFetching, refresh };
}
