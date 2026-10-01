/** 前后端共享的数据类型（不依赖任何服务端模块） */

export interface SymbolInfo {
  /** 币安交易对，如 BTCUSDT */
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** PRICE_FILTER.tickSize 原文，如 "0.01000000" */
  tickSize: string;
  /** 由 tickSize 推导的小数位数 */
  pricePrecision: number;
}

export interface Ticker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  /** 服务端拿到该行情的时间戳（毫秒） */
  fetchedAt: number;
}

export interface Candle {
  /** 秒级 UTC 时间戳 */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const KLINE_INTERVALS = ["15m", "1h", "4h", "1d", "1w"] as const;
export type KlineInterval = (typeof KLINE_INTERVALS)[number];
export const DEFAULT_INTERVAL: KlineInterval = "1h";
export const DEFAULT_SYMBOL = "BTCUSDT";
const CHART_SYMBOL_KEY = "chart-symbol";

export function readStoredChartSymbol(): string {
  try {
    const v = localStorage.getItem(CHART_SYMBOL_KEY)?.trim().toUpperCase() ?? "";
    return /^[A-Z0-9]{2,24}$/.test(v) ? v : DEFAULT_SYMBOL;
  } catch {
    return DEFAULT_SYMBOL;
  }
}

export function writeStoredChartSymbol(symbol: string) {
  try {
    localStorage.setItem(CHART_SYMBOL_KEY, symbol);
    window.dispatchEvent(new Event("chart-symbol"));
  } catch {
    // 隐私模式写不进时，这次会话仍用地址栏里的交易对
  }
}

export function isKlineInterval(x: unknown): x is KlineInterval {
  return typeof x === "string" && (KLINE_INTERVALS as readonly string[]).includes(x);
}

/** 收藏卡片上的开仓方向：开多 / 开空 */
export const POSITION_SIDES = ["long", "short"] as const;
export type PositionSide = (typeof POSITION_SIDES)[number];

export function isPositionSide(x: unknown): x is PositionSide {
  return x === "long" || x === "short";
}

/** 收藏页侧边栏的全局备注 */
export interface MemoDto {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteEventDto {
  id: string;
  summary: string;
  createdAt: string;
}

export interface FavoriteDto {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** null 表示尚未选择开多或开空 */
  side: PositionSide | null;
  targetLow: string | null;
  targetHigh: string | null;
  /** null 表示未填写备注 */
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PositionStatus = "open" | "closed";

/** 未平仓或已平完的仓位。margin / baseQty 为剩余值。 */
export interface PositionDto {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: PositionSide;
  margin: string;
  leverage: number;
  entryPrice: string;
  baseQty: string;
  status: PositionStatus;
  openedAt: string;
  closedAt: string | null;
}

/** 一次平仓记录。roi 为实际盈亏 / 释放保证金。 */
export interface PositionCloseDto {
  id: string;
  positionId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: PositionSide;
  entryPrice: string;
  closePrice: string;
  closedBase: string;
  closedMargin: string;
  realizedPnl: string;
  roi: string;
  createdAt: string;
}

export type ApiErrorKind =
  | "rate_limited"
  | "banned"
  | "geo_blocked"
  | "unavailable"
  | "timeout"
  | "network"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "validation"
  | "model_unavailable"
  | "internal";

export interface ApiErrorBody {
  error: {
    kind: ApiErrorKind;
    message: string;
    retryAfterSec?: number;
    /** 附加的机器可读信息，例如冲突时的 runId */
    details?: Record<string, unknown>;
  };
}

export interface TickersResponse {
  tickers: Ticker[];
  /** 请求中不属于当前可交易 USDT 现货对的交易对 */
  unknown: string[];
  serverTime: number;
}

export interface KlinesResponse {
  symbol: string;
  interval: KlineInterval;
  candles: Candle[];
  serverTime: number;
}

/** 搜索命中：交易对信息加上当时的最新价与 24 小时涨跌幅。行情失败时价格字段为 null。 */
export interface SearchHit extends SymbolInfo {
  lastPrice: string | null;
  priceChangePercent: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
}
