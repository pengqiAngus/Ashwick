/**
 * 特征计算与证据生成：全部确定性代码，不调用模型。
 */
import type { KlineInterval } from "@/lib/types";
import type { Evidence, IndicatorSet, Level, PredictionResult, Regime, TargetRange } from "@/lib/agent/schemas";
import type { Snapshot } from "@/lib/market/snapshot";
import { computeIndicatorSet } from "@/lib/quant/indicators";
import { computeLevels, mergeLevels } from "@/lib/quant/levels";
import { alignment, intervalRegime, overallRegime } from "@/lib/quant/regime";
import { Decimal, isWithinRange } from "@/lib/decimal";

export interface Features {
  indicators: IndicatorSet[];
  levels: { support: Level[]; resistance: Level[] };
  regime: Regime;
  alignment: { score: number; agree: boolean; detail: string };
  /** 最短周期的最后收盘价，作为“快照价格” */
  referencePrice: number;
  referenceInterval: KlineInterval;
  evidence: Evidence[];
}

const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(2)}%`);
const fx = (x: number | null, d = 2) => (x == null ? "n/a" : x.toFixed(d));

export function computeFeatures(snapshot: Snapshot, intervals: KlineInterval[]): Features {
  const indicators: IndicatorSet[] = [];
  const perIntervalLevels: Level[] = [];
  const regimes = [];
  for (const iv of intervals) {
    const candles = snapshot.series[iv] ?? [];
    if (candles.length === 0) continue;
    indicators.push(computeIndicatorSet(candles, iv));
    perIntervalLevels.push(...computeLevels(candles, iv));
    regimes.push(intervalRegime(candles, iv));
  }
  if (indicators.length === 0) throw new Error("没有任何周期的可用数据");
  const merged = mergeLevels(perIntervalLevels);
  const levels = { support: merged.filter((l) => l.side === "support"), resistance: merged.filter((l) => l.side === "resistance") };
  const regime = overallRegime(regimes);
  const al = alignment(regimes);
  const ref = indicators[0];

  const evidence: Evidence[] = [];
  for (const ind of indicators) {
    evidence.push({
      id: `ev:trend:${ind.interval}`,
      stepId: "features",
      kind: "indicator",
      text: `${ind.interval} 收盘 ${fx(ind.lastClose, 4)}；EMA20/50/200 = ${fx(ind.ema20, 4)} / ${fx(ind.ema50, 4)} / ${fx(ind.ema200, 4)}`,
      values: { lastClose: ind.lastClose, ema20: ind.ema20, ema50: ind.ema50, ema200: ind.ema200 },
    });
    evidence.push({
      id: `ev:momentum:${ind.interval}`,
      stepId: "features",
      kind: "indicator",
      text: `${ind.interval} RSI14 = ${fx(ind.rsi14, 1)}；MACD 柱 = ${fx(ind.macd?.histogram ?? null, 4)}（MACD ${fx(ind.macd?.macd ?? null, 4)} / 信号 ${fx(ind.macd?.signal ?? null, 4)}）`,
      values: { rsi14: ind.rsi14, macdHist: ind.macd?.histogram ?? null },
    });
    evidence.push({
      id: `ev:vol:${ind.interval}`,
      stepId: "features",
      kind: "indicator",
      text: `${ind.interval} ATR14 = ${fx(ind.atr14, 4)}（${pct(ind.atrPct)}）；布林带宽 ${pct(ind.bb?.widthPct ?? null)}，%B = ${fx(ind.bb?.percentB ?? null, 2)}；20 根实现波动率 ${pct(ind.realizedVol20)}`,
      values: { atrPct: ind.atrPct, bbWidthPct: ind.bb?.widthPct ?? null, percentB: ind.bb?.percentB ?? null, realizedVol20: ind.realizedVol20 },
    });
    evidence.push({
      id: `ev:volume:${ind.interval}`,
      stepId: "features",
      kind: "indicator",
      text: `${ind.interval} 最近一根成交量相对 20 根均量 ${pct(ind.volumeChange20)}；1/5/20 根收益率 ${pct(ind.returns.r1)} / ${pct(ind.returns.r5)} / ${pct(ind.returns.r20)}`,
      values: { volumeChange20: ind.volumeChange20, r1: ind.returns.r1, r5: ind.returns.r5, r20: ind.returns.r20 },
    });
  }
  for (const l of [...levels.support, ...levels.resistance]) {
    evidence.push({
      id: l.id,
      stepId: "features",
      kind: "level",
      text: `${l.side === "support" ? "支撑" : "阻力"} ${l.price.toFixed(4)}（${l.interval} 摆动点${l.method === "cluster" ? "聚类" : ""}，触碰 ${l.touches} 次，距当前 ${pct(l.distancePct)}）`,
      values: { price: l.price, touches: l.touches, distancePct: l.distancePct, interval: l.interval },
    });
  }
  evidence.push({
    id: "ev:regime",
    stepId: "features",
    kind: "regime",
    text: `规则判定市场状态：${regime.label}；${regime.evidence.join("；")}`,
    values: { label: regime.label },
  });
  evidence.push({
    id: "ev:alignment",
    stepId: "features",
    kind: "alignment",
    text: `多周期趋势一致性得分 ${al.score.toFixed(2)}（${al.agree ? "一致" : "存在分歧"}）：${al.detail}`,
    values: { score: al.score, agree: al.agree ? "yes" : "no" },
  });
  return { indicators, levels, regime, alignment: al, referencePrice: ref.lastClose, referenceInterval: ref.interval, evidence };
}

export function predictionEvidence(p: PredictionResult): Evidence {
  return {
    id: "ev:prediction",
    stepId: "prediction",
    kind: "prediction",
    text:
      p.status === "ok"
        ? `量化预测（模型 ${p.modelVersion}）：上涨概率 ${fx(p.upProbability, 3)}，预期收益 ${pct(p.expectedReturn)}`
        : `量化预测不可用（${p.status}）：${p.note}`,
    values: { status: p.status, modelVersion: p.modelVersion, upProbability: p.upProbability, expectedReturn: p.expectedReturn },
  };
}

export type TargetRelation = "inside" | "below" | "above" | "straddles";

/** 快照价格与用户目标区间的关系（Decimal 精确比较） */
export function targetRangeRelation(range: TargetRange, referencePrice: number): { relation: TargetRelation; note: string } | null {
  if (!range) return null;
  const price = new Decimal(referencePrice);
  const low = new Decimal(range.low);
  const high = new Decimal(range.high);
  if (isWithinRange(price, low, high)) {
    return { relation: "inside", note: `快照价格 ${price.toFixed(4)} 位于目标区间 ${range.low}–${range.high} 之内` };
  }
  if (price.lt(low)) {
    const gap = low.minus(price).div(price).times(100);
    return { relation: "below", note: `快照价格 ${price.toFixed(4)} 低于目标区间下限 ${range.low}，需上涨约 ${gap.toFixed(2)}% 才进入区间` };
  }
  const gap = price.minus(high).div(price).times(100);
  return { relation: "above", note: `快照价格 ${price.toFixed(4)} 高于目标区间上限 ${range.high}，需下跌约 ${gap.toFixed(2)}% 才进入区间` };
}

export function targetRangeEvidence(range: TargetRange, rel: { relation: TargetRelation; note: string } | null): Evidence | null {
  if (!range || !rel) return null;
  return { id: "ev:target_range", stepId: "features", kind: "target_range", text: rel.note, values: { low: range.low, high: range.high, relation: rel.relation } };
}
