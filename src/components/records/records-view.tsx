"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { Decimal } from "@/lib/decimal";
import {
  STAT_WINDOWS,
  cumulativeCurve,
  filterClosesByRange,
  matchingWindow,
  pnlByToken,
  rangeForWindow,
  summarizeCloses,
  type CloseRange,
  type CloseSummary,
  type StatWindowId,
} from "@/lib/close-stats";
import { changeDirection, formatDateTime, formatPair, formatPercent, formatPrice, formatSignedPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PositionCloseDto, PositionSide, SymbolInfo } from "@/lib/types";

const TABS = [
  { id: "detail", label: "明细" },
  { id: "windows", label: "区间盈亏" },
  { id: "tokens", label: "币种" },
] as const;

const VIEWS = [
  { id: "table", label: "表格" },
  { id: "chart", label: "图表" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type ViewId = (typeof VIEWS)[number]["id"];

const SIDE_LABEL: Record<PositionSide, string> = { long: "开多", short: "开空" };

const curveConfig = { cumulative: { label: "累计盈亏", color: "var(--foreground)" } } satisfies ChartConfig;
const pieConfig = { abs: { label: "绝对盈亏" } } satisfies ChartConfig;
const barConfig = { value: { label: "盈亏" } } satisfies ChartConfig;

export function RecordsView({
  closes,
  now,
  symbolInfos,
}: {
  closes: PositionCloseDto[];
  now: number;
  symbolInfos: Record<string, SymbolInfo>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("detail");
  const [range, setRange] = useState<CloseRange>(() => rangeForWindow("30d", now));
  const [view, setView] = useState<ViewId>("table");
  const [gone, setGone] = useState<string[]>([]);
  const [target, setTarget] = useState<PositionCloseDto | null>(null);
  const [saving, startSaving] = useTransition();
  const visible = useMemo(() => closes.filter((row) => !gone.includes(row.id)), [closes, gone]);
  const filtered = useMemo(() => filterClosesByRange(visible, range), [visible, range]);
  const preset = matchingWindow(range, now);

  const remove = () => {
    if (!target || saving) return;
    const id = target.id;
    startSaving(async () => {
      try {
        await apiFetch(`/api/position-closes/${encodeURIComponent(id)}`, { method: "DELETE" });
        setGone((ids) => [...ids, id]);
        setTarget(null);
        toast.success("已删除平仓记录");
        router.refresh();
      } catch (err) {
        toast.error(errorMessage(err, "删除平仓记录失败"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Segmented label="统计类型" value={tab} options={TABS} onChange={setTab} />
      {visible.length === 0 ? (
        <Empty />
      ) : (
        <>
          <DateRangeBar range={range} preset={preset} now={now} onChange={setRange} />
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">这个区间还没有平仓记录。</p>
          ) : tab === "detail" ? (
            <DetailPanel closes={filtered} view={view} onView={setView} symbolInfos={symbolInfos} onDelete={setTarget} />
          ) : tab === "windows" ? (
            <WindowsPanel closes={filtered} />
          ) : (
            <TokenPanel closes={filtered} />
          )}
        </>
      )}
      <ConfirmDeleteDialog
        open={target != null}
        title={target ? `删除 ${target.baseAsset} 平仓记录` : "删除平仓记录"}
        description="删除后这条平仓不再出现在明细里，区间盈亏和币种统计也不会再算它。已经减掉的持仓数量不会加回去。"
        pending={saving}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onConfirm={remove}
      />
    </div>
  );
}

function DateRangeBar({
  range,
  preset,
  now,
  onChange,
}: {
  range: CloseRange;
  preset: StatWindowId | null;
  now: number;
  onChange: (range: CloseRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented label="统计区间" value={preset} options={STAT_WINDOWS} onChange={(id) => onChange(rangeForWindow(id, now))} />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          从
          <Input type="date" value={range.start ?? ""} onChange={(event) => onChange({ ...range, start: event.target.value || null })} className="w-36" />
        </label>
        <label className="flex items-center gap-2">
          到
          <Input type="date" value={range.end ?? ""} onChange={(event) => onChange({ ...range, end: event.target.value || null })} className="w-36" />
        </label>
      </div>
    </div>
  );
}

function WindowsPanel({ closes }: { closes: PositionCloseDto[] }) {
  const summary = summarizeCloses(closes);
  return (
    <div className="flex flex-col gap-4">
      <CurveChart closes={closes} />
      <SummaryTable summary={summary} />
    </div>
  );
}

function SummaryTable({ summary }: { summary: CloseSummary }) {
  const cells: { label: string; value: string; className?: string }[] = [
    { label: "已实现盈亏", value: `${formatSignedPrice(summary.pnl, 2)} USDT`, className: pnlClass(summary.pnl) },
    { label: "笔数", value: String(summary.count) },
    { label: "胜率", value: formatShare(summary.winRate) },
    { label: "加权回报", value: summary.weightedRoi == null ? "—" : formatPercent(new Decimal(summary.weightedRoi).mul(100).toFixed()), className: pnlClass(summary.weightedRoi) },
    { label: "盈亏比", value: formatFactor(summary) },
    { label: "最大盈利", value: formatSignedPrice(summary.maxWin, 2), className: "text-up" },
    { label: "最大亏损", value: formatSignedPrice(summary.maxLoss, 2), className: "text-down" },
    { label: "做多", value: formatSignedPrice(summary.longPnl, 2), className: pnlClass(summary.longPnl) },
    { label: "做空", value: formatSignedPrice(summary.shortPnl, 2), className: pnlClass(summary.shortPnl) },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-3xl text-sm">
        <caption className="sr-only">区间盈亏</caption>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            {cells.map((cell) => (
              <th key={cell.label} className="px-3 py-2 font-medium">{cell.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            {cells.map((cell) => (
              <td key={cell.label} className={cn("px-3 py-2 tabular font-medium", cell.className)}>{cell.value}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({
  closes,
  view,
  onView,
  symbolInfos,
  onDelete,
}: {
  closes: PositionCloseDto[];
  view: ViewId;
  onView: (view: ViewId) => void;
  symbolInfos: Record<string, SymbolInfo>;
  onDelete: (row: PositionCloseDto) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Segmented label="展示方式" value={view} options={VIEWS} onChange={onView} />
      {view === "table" ? <CloseTable closes={closes} symbolInfos={symbolInfos} onDelete={onDelete} /> : <CurveChart closes={closes} />}
    </div>
  );
}

function CloseTable({
  closes,
  symbolInfos,
  onDelete,
}: {
  closes: PositionCloseDto[];
  symbolInfos: Record<string, SymbolInfo>;
  onDelete: (row: PositionCloseDto) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-3xl text-sm">
        <caption className="sr-only">平仓明细</caption>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            {["交易对", "方向", "开仓价", "平仓价", "保证金", "盈亏", "回报率", "时间", "操作"].map((label) => (
              <th key={label} className="px-3 py-2 font-medium">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {closes.map((row) => {
            const precision = symbolInfos[row.symbol]?.pricePrecision ?? 2;
            const dir = changeDirection(row.realizedPnl);
            const tone = dir === "up" ? "text-up" : dir === "down" ? "text-down" : undefined;
            return (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{formatPair(row.baseAsset, row.quoteAsset)}</td>
                <td className={cn("px-3 py-2", row.side === "long" ? "text-up" : "text-down")}>{SIDE_LABEL[row.side]}</td>
                <td className="px-3 py-2 tabular">{formatPrice(row.entryPrice, precision)}</td>
                <td className="px-3 py-2 tabular">{formatPrice(row.closePrice, precision)}</td>
                <td className="px-3 py-2 tabular">{formatPrice(row.closedMargin, 2)}</td>
                <td className={cn("px-3 py-2 tabular", tone)}>{formatSignedPrice(row.realizedPnl, 2)}</td>
                <td className={cn("px-3 py-2 tabular", tone)}>{formatPercent(new Decimal(row.roi).mul(100).toFixed())}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground tabular">
                  <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                </td>
                <td className="px-3 py-2">
                  <Button type="button" variant="destructive" size="xs" aria-label={`删除 ${row.symbol} 平仓记录`} onClick={() => onDelete(row)}>
                    删除
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CurveChart({ closes }: { closes: PositionCloseDto[] }) {
  const data = cumulativeCurve(closes).map((point) => ({
    at: point.at,
    cumulative: point.cumulative,
    value: Number(point.cumulative),
  }));
  return (
    <ChartContainer config={curveConfig} className="aspect-auto h-72 w-full" aria-label="累计已实现盈亏">
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="at" tickFormatter={(value) => formatDateTime(String(value)).slice(5, 16)} minTickGap={28} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(value) => formatSignedPrice(String(value), 2)} width={88} tickLine={false} axisLine={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => formatDateTime(String(payload?.[0]?.payload?.at ?? ""))}
              formatter={(_value, _name, item) => (
                <span className="font-medium tabular">{formatSignedPrice(String(item.payload?.cumulative ?? ""), 2)} USDT</span>
              )}
            />
          }
        />
        <Line dataKey="value" name="cumulative" type="monotone" stroke="var(--color-cumulative)" strokeWidth={2} dot={data.length < 24} />
      </LineChart>
    </ChartContainer>
  );
}

function TokenPanel({ closes }: { closes: PositionCloseDto[] }) {
  const tokens = pnlByToken(closes);
  const slices = tokens
    .filter((row) => !new Decimal(row.pnl).isZero())
    .map((row) => ({
      name: row.baseAsset,
      abs: new Decimal(row.pnl).abs().toNumber(),
      pnl: row.pnl,
      fill: new Decimal(row.pnl).isNegative() ? "var(--down)" : "var(--up)",
    }));
  const bars = tokens.map((row) => ({
    name: row.baseAsset,
    pnl: row.pnl,
    value: Number(row.pnl),
    fill: new Decimal(row.pnl).isNegative() ? "var(--down)" : "var(--up)",
  }));
  const values = bars.map((row) => row.value);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;
  const domain: [number, number] = [low - span * 0.08, high + span * 0.08];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {slices.length === 0 ? (
          <p className="text-sm text-muted-foreground">这段时间各币盈亏都是 0，饼图没有占比。</p>
        ) : (
          <ChartContainer config={pieConfig} className="mx-auto aspect-square h-72" aria-label="各币绝对盈亏占比">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="name"
                    formatter={(_value, _name, item) => (
                      <span className="font-medium tabular">
                        {String(item.payload?.name ?? "")} {formatSignedPrice(String(item.payload?.pnl ?? ""), 2)}
                      </span>
                    )}
                  />
                }
              />
              <Pie data={slices} dataKey="abs" nameKey="name" innerRadius={48} strokeWidth={2}>
                {slices.map((slice) => (
                  <Cell key={slice.name} fill={slice.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        <ChartContainer config={barConfig} className="aspect-auto h-56 w-full" aria-label="各币已实现盈亏">
          <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 12 }}>
            <XAxis type="number" domain={domain} minTickGap={28} tickFormatter={(value) => formatSignedPrice(String(value), 2)} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={64} tickLine={false} axisLine={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) => (
                    <span className="font-medium tabular">{formatSignedPrice(String(item.payload?.pnl ?? ""), 2)} USDT</span>
                  )}
                />
              }
            />
            <Bar dataKey="value" name="value" radius={4} maxBarSize={18}>
              {bars.map((row) => (
                <Cell key={row.name} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">各币盈亏</caption>
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {["币种", "笔数", "盈亏"].map((label) => (
                <th key={label} className="px-3 py-2 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tokens.map((row) => (
              <tr key={row.symbol} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{formatPair(row.baseAsset, row.quoteAsset)}</td>
                <td className="px-3 py-2 tabular">{row.count}</td>
                <td className={cn("px-3 py-2 tabular", pnlClass(row.pnl))}>{formatSignedPrice(row.pnl, 2)} USDT</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  const layoutId = useId();
  return (
    <LayoutGroup id={layoutId}>
      <div role="tablist" aria-label={label} className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.id)}
              className={cn(
                "relative h-8 rounded-md px-3 text-sm outline-none transition-colors duration-(--dur-fast)",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-muted"
                  transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">还没有平仓记录。</p>;
}

function pnlClass(raw: string | null): string | undefined {
  const dir = changeDirection(raw);
  if (dir === "up") return "text-up";
  if (dir === "down") return "text-down";
  return undefined;
}

function formatShare(raw: string | null): string {
  if (raw == null) return "—";
  return `${new Decimal(raw).mul(100).toFixed(2)}%`;
}

function formatFactor(summary: CloseSummary): string {
  if (summary.count === 0 || summary.profitFactor == null) {
    return summary.count > 0 && new Decimal(summary.pnl).gt(0) ? "∞" : "—";
  }
  return new Decimal(summary.profitFactor).toFixed(2);
}
