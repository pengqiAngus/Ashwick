/**
 * 把确定性计算结果压缩成给模型看的“事实与证据”文本。
 */
import type { AnalysisReport, DataQuality, Evidence, IndicatorSet, Level, PredictionResult, Regime, TargetRange } from "@/lib/agent/schemas";
import { HORIZON_LABEL, type Horizon } from "@/lib/agent/schemas";

const r = (x: number | null | undefined, digits = 6): number | null => (x == null || !Number.isFinite(x) ? null : Number(x.toPrecision(digits)));

export interface FactsInput {
  symbol: string;
  dataCutoff: string;
  horizon: Horizon;
  referencePrice: number;
  quality: DataQuality;
  regime: Regime;
  alignment: { score: number; agree: boolean; detail: string };
  indicators: IndicatorSet[];
  levels: { support: Level[]; resistance: Level[] };
  prediction: PredictionResult;
  targetRange: TargetRange;
  targetRelation: { relation: string; note: string } | null;
  evidence: Evidence[];
  unsupported: readonly string[];
}

export function buildFacts(f: FactsInput): string {
  const compact = {
    symbol: f.symbol,
    market: "binance spot",
    dataCutoff: f.dataCutoff,
    horizon: `${f.horizon}（${HORIZON_LABEL[f.horizon]}）`,
    referencePrice: r(f.referencePrice, 8),
    dataQuality: { ok: f.quality.ok, warnings: f.quality.warnings },
    regime: { label: f.regime.label, byInterval: f.regime.byInterval.map((b) => ({ interval: b.interval, trend: b.trend, volatility: b.volatility, emaStack: b.emaStack, emaSlopePct: r(b.emaSlopePct, 4) })) },
    alignment: { score: r(f.alignment.score, 3), agree: f.alignment.agree, detail: f.alignment.detail },
    indicators: f.indicators.map((i) => ({
      interval: i.interval,
      bars: i.barsUsed,
      lastClose: r(i.lastClose, 8),
      ema20: r(i.ema20, 8),
      ema50: r(i.ema50, 8),
      ema200: r(i.ema200, 8),
      rsi14: r(i.rsi14, 4),
      macdHist: r(i.macd?.histogram, 6),
      atrPct: r(i.atrPct, 4),
      bbWidthPct: r(i.bb?.widthPct, 4),
      percentB: r(i.bb?.percentB, 3),
      r1: r(i.returns.r1, 4),
      r5: r(i.returns.r5, 4),
      r20: r(i.returns.r20, 4),
      realizedVol20: r(i.realizedVol20, 4),
      volumeChange20: r(i.volumeChange20, 3),
    })),
    levels: {
      support: f.levels.support.map((l) => ({ levelId: l.id, price: r(l.price, 8), touches: l.touches, interval: l.interval, distancePct: r(l.distancePct, 4) })),
      resistance: f.levels.resistance.map((l) => ({ levelId: l.id, price: r(l.price, 8), touches: l.touches, interval: l.interval, distancePct: r(l.distancePct, 4) })),
    },
    prediction: { status: f.prediction.status, modelVersion: f.prediction.modelVersion, upProbability: f.prediction.upProbability, expectedReturn: f.prediction.expectedReturn, note: f.prediction.note },
    userTargetRange: f.targetRange ? { low: f.targetRange.low, high: f.targetRange.high, relation: f.targetRelation?.relation ?? null, note: f.targetRelation?.note ?? null, meaning: "用户的观察区间，不是止损止盈或持仓成本" } : null,
    unsupportedDataSources: f.unsupported,
    evidence: f.evidence.map((e) => ({ evidenceId: e.id, text: e.text })),
  };
  return JSON.stringify(compact);
}

/** 追问阶段给模型看的历史报告（压缩） */
export function compactReport(report: AnalysisReport): string {
  const { evidence, indicators, ...rest } = report;
  return JSON.stringify({
    ...rest,
    indicators: indicators.map((i) => ({ interval: i.interval, lastClose: r(i.lastClose, 8), ema20: r(i.ema20, 8), ema50: r(i.ema50, 8), ema200: r(i.ema200, 8), rsi14: r(i.rsi14, 4), macdHist: r(i.macd?.histogram, 6), atrPct: r(i.atrPct, 4), bbWidthPct: r(i.bb?.widthPct, 4), params: i.params, version: i.version })),
    evidence: evidence.map((e) => ({ evidenceId: e.id, text: e.text })),
  });
}
