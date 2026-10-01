import { Decimal } from "@/lib/decimal";
import type { PositionCloseDto } from "@/lib/types";

export const STAT_WINDOWS = [
  { id: "7d", label: "7天", days: 7 },
  { id: "30d", label: "30天", days: 30 },
  { id: "180d", label: "180天", days: 180 },
  { id: "all", label: "全部", days: null },
] as const;

export type StatWindowId = (typeof STAT_WINDOWS)[number]["id"];

const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

/** 东八区日历日，YYYY-MM-DD */
export function shanghaiDay(ms: number): string {
  const t = new Date(ms + SHANGHAI_OFFSET);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

export type CloseRange = { start: string | null; end: string | null };

/** 预设窗口换成东八区日期。全部为两端都不限制。7 天含今天在内的 7 个日历日。 */
export function rangeForWindow(windowId: StatWindowId, nowMs: number): CloseRange {
  const days = STAT_WINDOWS.find((w) => w.id === windowId)?.days ?? null;
  if (days == null) return { start: null, end: null };
  return { start: shanghaiDay(nowMs - (days - 1) * DAY_MS), end: shanghaiDay(nowMs) };
}

export function matchingWindow(range: CloseRange, nowMs: number): StatWindowId | null {
  return STAT_WINDOWS.find((window) => {
    const candidate = rangeForWindow(window.id, nowMs);
    return candidate.start === range.start && candidate.end === range.end;
  })?.id ?? null;
}

/** 按东八区日期含首尾过滤。开始晚于结束时对调。空字符串视为不限制。 */
export function filterClosesByRange(closes: PositionCloseDto[], range: CloseRange): PositionCloseDto[] {
  let start = range.start || null;
  let end = range.end || null;
  if (start && end && start > end) [start, end] = [end, start];
  const startMs = start ? Date.parse(`${start}T00:00:00+08:00`) : null;
  const endMs = end ? Date.parse(`${end}T23:59:59.999+08:00`) : null;
  return closes.filter((row) => {
    const t = new Date(row.createdAt).getTime();
    if (startMs != null && t < startMs) return false;
    if (endMs != null && t > endMs) return false;
    return true;
  });
}

export type CloseSummary = {
  count: number;
  pnl: string;
  /** 盈利笔数 / 全部笔数。没有记录时为 null */
  winRate: string | null;
  /** 合计盈亏 / 合计释放保证金。保证金为 0 时为 null */
  weightedRoi: string | null;
  /** 毛利 / 毛亏绝对值。没有亏损时为 null */
  profitFactor: string | null;
  maxWin: string | null;
  maxLoss: string | null;
  longPnl: string;
  shortPnl: string;
};

function money(value: Decimal): string {
  return value.toFixed();
}

export function summarizeCloses(closes: PositionCloseDto[]): CloseSummary {
  let pnl = new Decimal(0);
  let margin = new Decimal(0);
  let grossProfit = new Decimal(0);
  let grossLoss = new Decimal(0);
  let wins = 0;
  let maxWin: Decimal | null = null;
  let maxLoss: Decimal | null = null;
  let longPnl = new Decimal(0);
  let shortPnl = new Decimal(0);

  for (const row of closes) {
    const value = new Decimal(row.realizedPnl);
    pnl = pnl.plus(value);
    margin = margin.plus(row.closedMargin);
    if (row.side === "long") longPnl = longPnl.plus(value);
    else shortPnl = shortPnl.plus(value);
    if (value.gt(0)) {
      wins += 1;
      grossProfit = grossProfit.plus(value);
      if (maxWin == null || value.gt(maxWin)) maxWin = value;
    } else if (value.lt(0)) {
      grossLoss = grossLoss.plus(value.abs());
      if (maxLoss == null || value.lt(maxLoss)) maxLoss = value;
    }
  }

  return {
    count: closes.length,
    pnl: money(pnl),
    winRate: closes.length === 0 ? null : money(new Decimal(wins).div(closes.length)),
    weightedRoi: margin.isZero() ? null : money(pnl.div(margin)),
    profitFactor: grossLoss.isZero() ? null : money(grossProfit.div(grossLoss)),
    maxWin: maxWin == null ? null : money(maxWin),
    maxLoss: maxLoss == null ? null : money(maxLoss),
    longPnl: money(longPnl),
    shortPnl: money(shortPnl),
  };
}

export type TokenPnl = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  pnl: string;
  count: number;
};

export function pnlByToken(closes: PositionCloseDto[]): TokenPnl[] {
  const map = new Map<string, { baseAsset: string; quoteAsset: string; pnl: Decimal; count: number }>();
  for (const row of closes) {
    const prev = map.get(row.symbol);
    const value = new Decimal(row.realizedPnl);
    if (prev) {
      prev.pnl = prev.pnl.plus(value);
      prev.count += 1;
    } else {
      map.set(row.symbol, { baseAsset: row.baseAsset, quoteAsset: row.quoteAsset, pnl: value, count: 1 });
    }
  }
  return [...map.entries()]
    .map(([symbol, row]) => ({
      symbol,
      baseAsset: row.baseAsset,
      quoteAsset: row.quoteAsset,
      pnl: money(row.pnl),
      count: row.count,
    }))
    .sort((a, b) => {
      const diff = new Decimal(b.pnl).abs().cmp(new Decimal(a.pnl).abs());
      return diff === 0 ? a.symbol.localeCompare(b.symbol) : diff;
    });
}

export type CurvePoint = { at: string; cumulative: string };

/** 按平仓时间从早到晚累加已实现盈亏 */
export function cumulativeCurve(closes: PositionCloseDto[]): CurvePoint[] {
  const ordered = [...closes].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff === 0 ? a.id.localeCompare(b.id) : diff;
  });
  let sum = new Decimal(0);
  return ordered.map((row) => {
    sum = sum.plus(row.realizedPnl);
    return { at: row.createdAt, cumulative: money(sum) };
  });
}
