"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LoadingScene } from "@/components/ui/loading-scene";
import { fmtTime } from "@/components/agent/report-card";
import { HORIZON_LABEL, type AnalysisReport, type ConversationView } from "@/lib/agent/schemas";
import { cn } from "@/lib/utils";

const CandleChart = dynamic(() => import("@/components/chart/candle-chart").then((m) => m.CandleChart), {
  ssr: false,
  loading: () => <LoadingScene className="h-56" />,
});

export function ContextPanel({
  conversation,
  report,
  pricePrecision,
  className,
}: {
  conversation: ConversationView["conversation"];
  report: AnalysisReport | null;
  pricePrecision: number;
  className?: string;
}) {
  const symbol = report?.symbol ?? conversation.currentSymbol;
  const body = (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">交易对</dt>
          <dd className="font-mono text-foreground">{symbol ?? "未指定"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">分析周期</dt>
          <dd className="text-foreground">{(report?.intervals ?? conversation.currentIntervals).join(" / ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">预测时长</dt>
          <dd className="text-foreground">{report ? HORIZON_LABEL[report.horizon] : conversation.currentHorizon ? HORIZON_LABEL[conversation.currentHorizon] : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">报告数据截止</dt>
          <dd className="tabular text-foreground">{report ? fmtTime(report.dataCutoff) : "尚无报告"}</dd>
        </div>
      </dl>
      {report && (
        <div className="rounded-lg bg-background/60 p-2.5 text-xs">
          <p className="mb-1 font-medium text-muted-foreground">最新报告摘要（快照 {report.snapshotId.slice(0, 8)}）</p>
          <p className="line-clamp-5 leading-relaxed">{report.summary || report.synthesis.rationale}</p>
        </div>
      )}
      {symbol && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>实时图表 · 1h（当前行情，非报告快照）</span>
            <Link href={`/chart?symbol=${encodeURIComponent(symbol)}`} className="underline-offset-2 hover:text-foreground hover:underline">
              打开 K 线页
            </Link>
          </div>
          <div className="agent-mini-chart">
            <CandleChart symbol={symbol} interval="1h" pricePrecision={pricePrecision} />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <aside className={cn("min-w-0", className)} aria-label="分析上下文">
      {/* 桌面端常驻 */}
      <div className="hidden rounded-xl border border-border bg-card p-4 shadow-(--shadow-panel) lg:block">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">当前上下文</h2>
        {body}
      </div>
      {/* 手机端折叠 */}
      <Collapsible className="group/ctx rounded-xl border border-border bg-card lg:hidden">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="text-muted-foreground">
            当前上下文{symbol ? ` · ${symbol}` : ""}
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-(--dur) group-data-open/ctx:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-(--dur) ease-(--ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
          <div className="border-t border-border px-4 py-3">{body}</div>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
