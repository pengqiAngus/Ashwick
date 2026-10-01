import { binanceGet, BinanceError } from "@/lib/binance/client";
import type { BinanceExchangeInfo } from "@/lib/binance/types";
import { serverEnv } from "@/lib/env";
import { precisionFromTickSize } from "@/lib/decimal";
import type { SymbolInfo } from "@/lib/types";

interface SymbolTable {
  items: SymbolInfo[];
  bySymbol: Map<string, SymbolInfo>;
  fetchedAt: number;
}

/** 缓存挂在 globalThis 上，避免开发环境热更新时反复拉取 2MB 的 exchangeInfo */
const store = globalThis as unknown as {
  __symbolTable?: SymbolTable;
  __symbolTableInflight?: Promise<SymbolTable>;
};

const QUOTE_ASSET = "USDT";
const SYMBOL_RE = /^[A-Z0-9]{2,24}$/;

/** 搜索框聚焦但未输入时展示的主流 USDT 现货，按这个顺序 */
const POPULAR_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];

/** 规范化 URL/输入中的交易对：去空格、大写；不合法返回 null */
export function normalizeSymbolParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

function toSymbolInfo(raw: BinanceExchangeInfo["symbols"][number]): SymbolInfo | null {
  if (raw.quoteAsset !== QUOTE_ASSET) return null;
  if (raw.status !== "TRADING" || !raw.isSpotTradingAllowed) return null;
  const pf = raw.filters.find((f) => f.filterType === "PRICE_FILTER");
  const tickSize = pf?.tickSize ?? "0.01";
  return {
    symbol: raw.symbol,
    baseAsset: raw.baseAsset,
    quoteAsset: raw.quoteAsset,
    tickSize,
    pricePrecision: precisionFromTickSize(tickSize),
  };
}

async function fetchSymbolTable(): Promise<SymbolTable> {
  const info = await binanceGet<BinanceExchangeInfo>("api/v3/exchangeInfo", {
    permissions: "SPOT",
    symbolStatus: "TRADING",
    showPermissionSets: "false",
  });
  const items: SymbolInfo[] = [];
  for (const s of info.symbols ?? []) {
    const item = toSymbolInfo(s);
    if (item) items.push(item);
  }
  items.sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));
  return { items, bySymbol: new Map(items.map((i) => [i.symbol, i])), fetchedAt: Date.now() };
}

/**
 * 获取可交易 USDT 现货交易对表。
 * - TTL 内直接返回缓存
 * - 过期后刷新；刷新失败且存在旧缓存时继续使用旧缓存（stale-if-error）
 * - 并发刷新共享同一个 Promise
 */
export async function getSymbolTable(): Promise<SymbolTable> {
  const cached = store.__symbolTable;
  const fresh = cached && Date.now() - cached.fetchedAt < serverEnv.symbolsCacheTtlMs;
  if (cached && fresh) return cached;

  if (!store.__symbolTableInflight) {
    store.__symbolTableInflight = fetchSymbolTable()
      .then((table) => {
        store.__symbolTable = table;
        return table;
      })
      .finally(() => {
        store.__symbolTableInflight = undefined;
      });
  }

  try {
    return await store.__symbolTableInflight;
  } catch (err) {
    if (cached) {
      console.warn("[binance] exchangeInfo 刷新失败，继续使用旧缓存:", err instanceof Error ? err.message : err);
      return cached;
    }
    throw err;
  }
}

/**
 * 搜索交易对：匹配 baseAsset 与 symbol，优先级 精确 > 前缀 > 包含。
 * 忽略大小写与首尾空格，空输入返回空数组。
 */
export async function searchSymbols(query: string, limit = 10): Promise<SymbolInfo[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const { items } = await getSymbolTable();

  const ranked: Array<{ item: SymbolInfo; rank: number }> = [];
  for (const item of items) {
    const base = item.baseAsset;
    const sym = item.symbol;
    let rank: number;
    if (base === q || sym === q) rank = 0;
    else if (base.startsWith(q) || sym.startsWith(q)) rank = 1;
    else if (base.includes(q) || sym.includes(q)) rank = 2;
    else continue;
    ranked.push({ item, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.item.baseAsset.length - b.item.baseAsset.length ||
      a.item.baseAsset.localeCompare(b.item.baseAsset),
  );
  return ranked.slice(0, limit).map((r) => r.item);
}

/** 主流交易对。表里没有的跳过，顺序与 POPULAR_SYMBOLS 一致。 */
export async function listPopularSymbols(): Promise<SymbolInfo[]> {
  const { bySymbol } = await getSymbolTable();
  const out: SymbolInfo[] = [];
  for (const symbol of POPULAR_SYMBOLS) {
    const item = bySymbol.get(symbol);
    if (item) out.push(item);
  }
  return out;
}

/** 按交易对精确查找；不是可交易 USDT 现货对时返回 null */
export async function getSymbol(symbol: string): Promise<SymbolInfo | null> {
  const s = normalizeSymbolParam(symbol);
  if (!s) return null;
  const { bySymbol } = await getSymbolTable();
  return bySymbol.get(s) ?? null;
}

/** 与 getSymbol 相同，但不存在时抛出 not_found 错误 */
export async function requireSymbol(symbol: string): Promise<SymbolInfo> {
  const info = await getSymbol(symbol);
  if (!info) throw new BinanceError("not_found", `不支持的交易对：${symbol}`, { status: 404 });
  return info;
}
