"use client";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { cn } from "@/lib/utils";
import { HORIZON_LABEL, type AnalysisReport } from "@/lib/agent/schemas";
import { ChevronDownIcon } from "lucide-react";

const OUTLOOK: Record<AnalysisReport["synthesis"]["outlook"], { label: string; cls: string }> = {
  bullish: { label: "偏多", cls: "bg-up/15 text-up" },
  bearish: { label: "偏空", cls: "bg-down/15 text-down" },
  neutral: { label: "中性", cls: "bg-muted text-muted-foreground" },
  uncertain: { label: "不确定", cls: "bg-muted text-muted-foreground" },
};
const REC: Record<AnalysisReport["synthesis"]["recommendation"], string> = {
  watch: "可观察",
  wait_confirmation: "等待确认",
  avoid: "暂不参与",
};
const REGIME: Record<AnalysisReport["regime"]["label"], string> = {
  trending_up: "上升趋势",
  trending_down: "下降趋势",
  ranging: "震荡",
  volatile: "高波动",
  unclear: "不明确",
};
const RELATION: Record<NonNullable<AnalysisReport["targetRange"]>["relation"], string> = {
  inside: "价格在区间内",
  below: "价格低于区间",
  above: "价格高于区间",
  straddles: "区间跨越价格",
};

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function pct(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(2)}%`;
}
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
}

function Section({ title, children, defaultOpen = true, className }: { title: string; children: React.ReactNode; defaultOpen?: boolean; className?: string }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("group/sec border-t border-border pt-2", className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-sm py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        {title}
        <ChevronDownIcon className="size-3.5 transition-transform duration-(--dur) group-data-open/sec:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-(--dur) ease-(--ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
        <div className="pb-2 pt-1 text-sm">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function List({ items, tone }: { items: string[]; tone?: "up" | "down" | "muted" }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">无</p>;
  return (
    <ul className={cn("list-disc space-y-1 pl-4 text-sm", tone === "up" && "marker:text-up", tone === "down" && "marker:text-down", tone === "muted" && "marker:text-muted-foreground")}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export function ReportCard({ report, pricePrecision = 2, compact = false }: { report: AnalysisReport; pricePrecision?: number; compact?: boolean }) {
  const o = OUTLOOK[report.synthesis.outlook];
  const p = (n: number | null | undefined) => fmt(n, pricePrecision);
  const predictionUnavailable = report.prediction.status !== "ok";

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-(--shadow-panel)" aria-label={`${report.symbol} 分析报告`}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight">{report.symbol} 分析报告</h3>
          <Badge className={cn("rounded-full", o.cls)}>{o.label}</Badge>
          <Badge variant="outline" className="rounded-full">
            {REC[report.synthesis.recommendation]}
          </Badge>
          {predictionUnavailable && (
            <Badge variant="secondary" className="rounded-full text-muted-foreground">
              仅技术分析
            </Badge>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <div>
            <dt>数据截止</dt>
            <dd className="tabular text-foreground">{fmtTime(report.dataCutoff)}</dd>
          </div>
          <div>
            <dt>图表周期</dt>
            <dd className="text-foreground">{report.intervals.join(" / ")}</dd>
          </div>
          <div>
            <dt>预测时长</dt>
            <dd className="text-foreground">{HORIZON_LABEL[report.horizon]}</dd>
          </div>
          <div>
            <dt>市场状态</dt>
            <dd className="text-foreground">{REGIME[report.regime.label]}</dd>
          </div>
        </dl>
        {!report.dataQuality.ok || report.dataQuality.warnings.length > 0 ? (
          <p className="text-xs text-destructive/90">数据提示：{report.dataQuality.warnings.join("；")}</p>
        ) : null}
      </header>

      <p className="text-sm leading-relaxed">{report.synthesis.rationale}</p>
      {report.synthesis.confidenceNote && <p className="text-xs text-muted-foreground">证据质量：{report.synthesis.confidenceNote}</p>}

      {!compact && (
        <>
          <Section title="技术指标">
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[520px] text-xs">
                <thead className="text-muted-foreground">
                  <tr className="[&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                    <th>周期</th>
                    <th>收盘</th>
                    <th>EMA20</th>
                    <th>EMA50</th>
                    <th>EMA200</th>
                    <th>RSI14</th>
                    <th>MACD 柱</th>
                    <th>ATR%</th>
                    <th>带宽</th>
                    <th>量变</th>
                  </tr>
                </thead>
                <tbody>
                  {report.indicators.map((i) => (
                    <tr key={i.interval} className="border-t border-border/60 [&>td]:py-1">
                      <td className="font-mono">{i.interval}</td>
                      <td>{p(i.lastClose)}</td>
                      <td>{p(i.ema20)}</td>
                      <td>{p(i.ema50)}</td>
                      <td>{p(i.ema200)}</td>
                      <td>{fmt(i.rsi14, 1)}</td>
                      <td className={cn(i.macd && i.macd.histogram > 0 ? "text-up" : i.macd && i.macd.histogram < 0 ? "text-down" : "")}>{fmt(i.macd?.histogram, 4)}</td>
                      <td>{pct(i.atrPct)}</td>
                      <td>{pct(i.bb?.widthPct)}</td>
                      <td>{pct(i.volumeChange20)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              参数：EMA 20/50/200，RSI 14，MACD 12/26/9，ATR 14，布林带 20/2；多周期一致性 {report.alignment.score.toFixed(2)}（{report.alignment.detail}）
            </p>
          </Section>

          <Section title="支撑与阻力">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["support", "resistance"] as const).map((side) => (
                <div key={side}>
                  <p className={cn("mb-1 text-xs font-medium", side === "support" ? "text-up" : "text-down")}>{side === "support" ? "支撑" : "阻力"}</p>
                  {report.levels[side].length === 0 ? (
                    <p className="text-xs text-muted-foreground">未识别到可靠价位</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {report.levels[side].map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-2">
                          <span className="tabular font-medium text-foreground">{p(l.price)}</span>
                          <span className="text-muted-foreground">
                            {l.interval} · 触碰 {l.touches} 次 · {l.distancePct >= 0 ? "+" : ""}
                            {(l.distancePct * 100).toFixed(2)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">价位由摆动高低点按 ATR 带宽聚类得到，附带形成该价位的 K 线时间；未在证据中出现的价格不会进入报告。</p>
          </Section>

          <Section title="多空证据与冲突">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-up">多头</p>
                <List items={report.bull?.evidence ?? []} tone="up" />
                {report.bull?.invalidation.length ? (
                  <>
                    <p className="mt-2 text-[11px] text-muted-foreground">失效条件</p>
                    <List items={report.bull.invalidation} tone="muted" />
                  </>
                ) : null}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-down">空头</p>
                <List items={report.bear?.evidence ?? []} tone="down" />
                {report.bear?.invalidation.length ? (
                  <>
                    <p className="mt-2 text-[11px] text-muted-foreground">失效条件</p>
                    <List items={report.bear.invalidation} tone="muted" />
                  </>
                ) : null}
              </div>
            </div>
            {report.synthesis.conflicts.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-muted-foreground">冲突点</p>
                <List items={report.synthesis.conflicts} tone="muted" />
              </>
            )}
          </Section>

          <Section title="情景与失效条件" defaultOpen={report.scenarios.length > 0}>
            {report.scenarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">未构造情景（证据不足或无可引用价位）</p>
            ) : (
              <ul className="space-y-2">
                {report.scenarios.map((s, i) => (
                  <li key={i} className="rounded-md bg-background/60 p-2.5 text-xs">
                    <p className="font-medium text-foreground">
                      {s.name}
                      <span className="ml-2 text-muted-foreground">{s.direction === "long" ? "多头研究情景" : s.direction === "short" ? "空头研究情景" : "不参与"}</span>
                    </p>
                    <p className="mt-1 text-muted-foreground">条件：{s.condition}</p>
                    <p className="tabular mt-1 text-muted-foreground">
                      入场参考 {s.entryZone ? `${p(s.entryZone.low)}–${p(s.entryZone.high)}` : "—"} · 止损参考 {s.stopRef != null ? p(s.stopRef) : "—"} · 目标{" "}
                      {s.targets?.length ? s.targets.map((t) => p(t)).join(" / ") : "—"}
                    </p>
                    <p className="mt-1 text-muted-foreground">失效：{s.invalidation}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">情景为研究性质，不是交易指令；本系统未连接任何交易账户，也不了解持仓。</p>
          </Section>

          <Section title="风险">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-medium">观察到的风险</p>
                <List items={report.risks.observed} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">数据缺口</p>
                <List items={report.risks.dataGaps} tone="muted" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">假设风险</p>
                <List items={report.risks.assumed} tone="muted" />
              </div>
            </div>
          </Section>
        </>
      )}

      <Section title="量化预测" defaultOpen={!compact}>
        {predictionUnavailable ? (
          <p className="text-xs text-muted-foreground">
            状态：{report.prediction.status} · 模型版本：{report.prediction.modelVersion ?? "无"} · 上涨概率 / 预期收益：不可用。{report.prediction.note}
          </p>
        ) : (
          <p className="tabular text-sm">
            模型 {report.prediction.modelVersion} · 上涨概率 {fmt(report.prediction.upProbability, 3)} · 预期收益 {pct(report.prediction.expectedReturn)}
          </p>
        )}
      </Section>

      {report.targetRange && (
        <Section title="与目标区间的关系" defaultOpen>
          <p className="tabular text-sm">
            {RELATION[report.targetRange.relation]}：{report.targetRange.low}–{report.targetRange.high} USDT
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{report.targetRange.note}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">目标区间是你的观察条件。未建立路径模型，因此不提供“触达概率”，只做情景说明。</p>
        </Section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <Sources>
          <SourcesTrigger count={report.sources.length} />
          <SourcesContent>
            {report.sources.map((s) => (
              <Source key={s.id} title={s.label} />
            ))}
            <Source title={`快照 ${report.snapshotId} · 未接入：${report.unsupported.join("、")}`} />
          </SourcesContent>
        </Sources>
        <span className="text-[11px] text-muted-foreground">
          {report.modelInfo.analystModel} · {report.modelInfo.promptVersion}
        </span>
      </footer>
    </article>
  );
}
