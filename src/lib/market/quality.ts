import type { KlineInterval } from "@/lib/types";
import type { DataQuality } from "@/lib/agent/schemas";
import { countGaps, INTERVAL_MS, type AnalysisCandle, type NormalizeStats } from "@/lib/market/ohlcv";

export interface IntervalInput {
  interval: KlineInterval;
  candles: AnalysisCandle[];
  required: number;
  stats: NormalizeStats;
  /** 快照时间（毫秒） */
  cutoff: number;
}

/**
 * 数据质量检查：
 * - 根数是否满足预热要求
 * - 相邻缺口
 * - 最后一根已收盘 K 线是否“过期”（距 cutoff 超过 2 个周期说明缺失近期数据）
 * - 数值异常（收盘价为 0/非有限）在 normalize 阶段已剔除，此处只汇报数量
 */
export function assessQuality(inputs: IntervalInput[]): DataQuality {
  const perInterval = inputs.map((it) => {
    const warnings: string[] = [];
    const count = it.candles.length;
    const last = it.candles.at(-1);
    const staleMs = last ? it.cutoff - last.closeTime : null;
    const gaps = countGaps(it.candles, it.interval);
    let ok = true;
    if (count < it.required) {
      ok = false;
      warnings.push(`${it.interval} 仅获取到 ${count} 根已收盘 K 线，少于指标预热所需的 ${it.required} 根`);
    }
    if (gaps > 0) warnings.push(`${it.interval} 序列存在 ${gaps} 处时间缺口`);
    if (staleMs != null && staleMs > 2 * INTERVAL_MS[it.interval]) {
      ok = false;
      warnings.push(`${it.interval} 最后一根已收盘 K 线距快照时间 ${Math.round(staleMs / 60_000)} 分钟，数据可能过期`);
    }
    if (it.stats.invalidRemoved > 0) warnings.push(`${it.interval} 剔除了 ${it.stats.invalidRemoved} 条异常记录`);
    if (it.stats.duplicatesRemoved > 0) warnings.push(`${it.interval} 去重 ${it.stats.duplicatesRemoved} 条重复记录`);
    return {
      interval: it.interval,
      count,
      required: it.required,
      gaps,
      duplicatesRemoved: it.stats.duplicatesRemoved,
      invalidRemoved: it.stats.invalidRemoved,
      staleMs,
      ok,
      warnings,
    };
  });
  const warnings = perInterval.flatMap((p) => p.warnings);
  return { ok: perInterval.every((p) => p.ok), perInterval, warnings };
}
