"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingScene } from "@/components/ui/loading-scene";
import { apiFetch, errorMessage, isAbortError } from "@/lib/client-api";
import { minMoveFromPrecision } from "@/lib/decimal";
import type { Candle, KlineInterval, KlinesResponse } from "@/lib/types";

const INITIAL_LIMIT = 500;

/** 增量刷新间隔：与周期匹配 */
const REFRESH_MS: Record<KlineInterval, number> = {
  "15m": 10_000,
  "1h": 20_000,
  "4h": 30_000,
  "1d": 30_000,
  "1w": 30_000,
};

/** 图表库只解析逗号分隔的 rgb/rgba。主题色的计算值是 lab()，先画到 1px 再读回。 */
function themeColor(name: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.documentElement.append(probe);
  const raw = getComputedStyle(probe).color;
  probe.remove();
  if (/^rgba?\(\s*\d+,\s*\d+,\s*\d+/.test(raw)) return raw;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return raw;
  ctx.canvas.width = ctx.canvas.height = 1;
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const alpha = Math.round((a / 255) * 1000) / 1000;
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type LoadState = { status: "loading" } | { status: "ready"; count: number } | { status: "error"; message: string };

function applyChartTheme(chart: IChartApi, series: ISeriesApi<"Candlestick">) {
  const text = themeColor("--color-muted-foreground");
  const border = themeColor("--color-border");
  const crosshair = themeColor("--color-chart-crosshair");
  const label = themeColor("--color-card");
  const up = themeColor("--color-up");
  const down = themeColor("--color-down");
  chart.applyOptions({
    layout: { textColor: text },
    grid: { vertLines: { color: border }, horzLines: { color: border } },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
    crosshair: {
      vertLine: { color: crosshair, labelBackgroundColor: label },
      horzLine: { color: crosshair, labelBackgroundColor: label },
    },
  });
  series.applyOptions({
    upColor: up,
    downColor: down,
    wickUpColor: up,
    wickDownColor: down,
  });
}

function toBar(c: Candle) {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

export function CandleChart({
  symbol,
  interval,
  pricePrecision,
}: {
  symbol: string;
  interval: KlineInterval;
  pricePrecision: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryTick, setRetryTick] = useState(0);

  // 1) 创建/销毁图表实例（仅一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // canvas 无法解析 CSS 变量，取容器计算后的字体栈
    const fontFamily = getComputedStyle(el).fontFamily || "system-ui, sans-serif";
    const chart = createChart(el, {
      autoSize: false,
      layout: {
        background: { color: "transparent" },
        fontFamily,
        fontSize: 12,
        attributionLogo: true,
      },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4 },
      localization: { locale: "zh-CN" },
      handleScroll: true,
      handleScale: true,
    });
    const series = chart.addSeries(CandlestickSeries, { borderVisible: false });
    applyChartTheme(chart, series);
    chartRef.current = chart;
    seriesRef.current = series;

    const themeObserver = new MutationObserver(() => applyChartTheme(chart, series));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) chart.resize(rect.width, rect.height);
    });
    observer.observe(el);
    chart.resize(el.clientWidth, el.clientHeight);

    return () => {
      themeObserver.disconnect();
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 2) 价格精度随交易对变化
  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: { type: "price", precision: pricePrecision, minMove: minMoveFromPrecision(pricePrecision) },
    });
  }, [pricePrecision]);

  // 3) 加载与增量更新：symbol/interval 变化时中止旧请求、清空旧数据
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    let disposed = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let lastTime = 0;
    let inFlight = false;

    series.setData([]);
    setState({ status: "loading" });

    const url = (limit: number) =>
      `/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;

    const clearTimer = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
    };

    const schedule = (delay: number) => {
      clearTimer();
      if (disposed || document.visibilityState === "hidden") return;
      timer = window.setTimeout(() => void refresh(), delay);
    };

    const loadInitial = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await apiFetch<KlinesResponse>(url(INITIAL_LIMIT), { signal: controller.signal });
        if (disposed) return;
        series.setData(res.candles.map(toBar));
        lastTime = res.candles.at(-1)?.time ?? 0;
        chart.timeScale().fitContent();
        chart.timeScale().scrollToRealTime();
        setState({ status: "ready", count: res.candles.length });
        schedule(REFRESH_MS[interval]);
      } catch (err) {
        if (disposed || isAbortError(err)) return;
        setState({ status: "error", message: errorMessage(err, "K 线加载失败") });
      }
    };

    const refresh = async () => {
      if (disposed || inFlight || lastTime === 0) return;
      inFlight = true;
      controller = new AbortController();
      let delay = REFRESH_MS[interval];
      try {
        const res = await apiFetch<KlinesResponse>(url(2), { signal: controller.signal });
        if (disposed) return;
        for (const c of res.candles) {
          // 等于最后一根：更新仍在变化的当前蜡烛；更新：追加新蜡烛；更早的忽略
          if (c.time >= lastTime) {
            series.update(toBar(c));
            lastTime = c.time;
          }
        }
      } catch (err) {
        if (disposed || isAbortError(err)) return;
        // 增量失败不打断已展示的图表，仅放慢刷新
        delay = Math.max(delay, 15_000);
      } finally {
        inFlight = false;
        if (!disposed) schedule(delay);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clearTimer();
        void refresh();
      } else {
        clearTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void loadInitial();

    return () => {
      disposed = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [symbol, interval, retryTick]);

  return (
    <div className="relative h-[clamp(320px,58vh,640px)] w-full min-w-0">
      <div ref={containerRef} className="absolute inset-0" />
      {state.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 bg-background/40">
          <LoadingScene />
        </div>
      )}
      {state.status === "error" && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 px-4 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRetryTick((t) => t + 1)}>
            <RefreshCwIcon aria-hidden />
            重试
          </Button>
        </div>
      )}
    </div>
  );
}
