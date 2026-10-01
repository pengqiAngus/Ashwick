"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiFetch, errorMessage, isAbortError } from "@/lib/client-api";
import type { SearchHit, SearchResponse } from "@/lib/types";

export type SearchStatus = "idle" | "loading" | "ok" | "empty" | "error";

export interface SymbolSearchState {
  status: SearchStatus;
  results: SearchHit[];
  errorText: string | null;
  /** 当前结果对应的（已去空格、大写的）查询词 */
  query: string;
}

const idle: SymbolSearchState = { status: "idle", results: [], errorText: null, query: "" };

/**
 * 交易对搜索：防抖 280ms，忽略大小写与首尾空格，
 * 每次请求带递增序号并中止上一请求，过期响应直接丢弃。
 * suggest 为真且输入为空时，拉取一次热门列表并缓存。
 */
export function useSymbolSearch(input: string, suggest = false): SymbolSearchState {
  const normalized = input.trim().toUpperCase();
  const debounced = useDebouncedValue(normalized, 280);
  const [state, setState] = useState<SymbolSearchState>(idle);
  const popularRef = useRef<SearchHit[] | null>(null);
  const normalizedRef = useRef(normalized);
  normalizedRef.current = normalized;
  const seqRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const popularControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (normalized || !suggest || popularRef.current) return;
    popularControllerRef.current?.abort();
    const controller = new AbortController();
    popularControllerRef.current = controller;
    setState({ status: "loading", results: [], errorText: null, query: "" });

    apiFetch<SearchResponse>("/api/symbols/search", { signal: controller.signal })
      .then((res) => {
        popularRef.current = res.results;
        if (normalizedRef.current) return;
        setState({
          status: res.results.length ? "ok" : "empty",
          results: res.results,
          errorText: null,
          query: "",
        });
      })
      .catch((err) => {
        if (isAbortError(err) || normalizedRef.current) return;
        setState({ status: "error", results: [], errorText: errorMessage(err, "搜索失败，请稍后重试"), query: "" });
      });

    return () => controller.abort();
  }, [normalized, suggest]);

  useEffect(() => {
    controllerRef.current?.abort();
    const seq = ++seqRef.current;

    if (!debounced) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, status: "loading", errorText: null }));

    apiFetch<SearchResponse>(`/api/symbols/search?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then((res) => {
        if (seq !== seqRef.current) return;
        setState({
          status: res.results.length ? "ok" : "empty",
          results: res.results,
          errorText: null,
          query: debounced,
        });
      })
      .catch((err) => {
        if (seq !== seqRef.current || isAbortError(err)) return;
        setState({ status: "error", results: [], errorText: errorMessage(err, "搜索失败，请稍后重试"), query: debounced });
      });

    return () => controller.abort();
  }, [debounced]);

  if (!normalized) {
    if (!suggest) return idle;
    if (popularRef.current) return { status: "ok", results: popularRef.current, errorText: null, query: "" };
    if (state.query !== "") return { status: "loading", results: [], errorText: null, query: "" };
  }
  return state;
}
