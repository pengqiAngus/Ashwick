/**
 * 确定性校验与报告组装：所有价格位必须来自已计算的支撑阻力；未知 evidenceId 被丢弃。
 */
import { analysisReportSchema, type AnalysisReport, type Evidence, type Level, type scenariosOutputSchema } from "@/lib/agent/schemas";
import type { z } from "zod";

export type ScenariosOutput = z.infer<typeof scenariosOutputSchema>;

export function filterEvidenceIds(ids: string[] | undefined, known: Set<string>): string[] {
  return (ids ?? []).filter((id) => known.has(id));
}

export function resolveScenarios(out: ScenariosOutput | null, levels: Level[], known: Set<string>): AnalysisReport["scenarios"] {
  if (!out) return [];
  const byId = new Map(levels.map((l) => [l.id, l]));
  return out.scenarios.map((s) => {
    const entries = s.entryLevelIds.map((id) => byId.get(id)).filter((l): l is Level => Boolean(l));
    const stop = s.stopLevelId ? byId.get(s.stopLevelId) ?? null : null;
    const targets = s.targetLevelIds.map((id) => byId.get(id)).filter((l): l is Level => Boolean(l));
    const used = [...entries, ...(stop ? [stop] : []), ...targets].map((l) => l.id);
    return {
      name: s.name,
      direction: s.direction,
      condition: s.condition,
      entryZone: entries.length ? { low: Math.min(...entries.map((l) => l.price)), high: Math.max(...entries.map((l) => l.price)) } : null,
      stopRef: stop?.price ?? null,
      targets: targets.length ? targets.map((l) => l.price) : null,
      invalidation: s.invalidation,
      evidenceIds: filterEvidenceIds([...new Set(used)], known),
    };
  });
}

/** outlook 与 recommendation 的合法组合：不确定时不能给出 watch 以外的积极观察建议 */
export function normalizeStance(outlook: AnalysisReport["synthesis"]["outlook"], rec: AnalysisReport["synthesis"]["recommendation"]) {
  if (outlook === "uncertain" && rec === "watch") return { outlook, recommendation: "wait_confirmation" as const };
  return { outlook, recommendation: rec };
}

export interface ValidationIssue {
  code: string;
  message: string;
}

/** 对组装完成的报告做最终校验；返回问题列表（空表示通过） */
export function validateReport(report: AnalysisReport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = analysisReportSchema.safeParse(report);
  if (!parsed.success) issues.push({ code: "schema", message: parsed.error.message.slice(0, 500) });
  const known = new Set(report.evidence.map((e) => e.id));
  const levelIds = new Set([...report.levels.support, ...report.levels.resistance].map((l) => l.id));
  for (const s of report.scenarios) {
    for (const id of s.evidenceIds) if (!known.has(id)) issues.push({ code: "scenario_evidence", message: `情景「${s.name}」引用了未知证据 ${id}` });
    const prices = [...(s.entryZone ? [s.entryZone.low, s.entryZone.high] : []), ...(s.stopRef != null ? [s.stopRef] : []), ...(s.targets ?? [])];
    const levelPrices = new Set([...report.levels.support, ...report.levels.resistance].map((l) => l.price));
    for (const p of prices) if (!levelPrices.has(p)) issues.push({ code: "scenario_price", message: `情景「${s.name}」的价格 ${p} 不来自已计算的支撑阻力` });
    if (s.evidenceIds.some((id) => id.startsWith("lv:") && !levelIds.has(id))) issues.push({ code: "scenario_level", message: `情景「${s.name}」引用了不存在的价位` });
  }
  if (report.prediction.status !== "ok") {
    if (report.prediction.upProbability != null || report.prediction.expectedReturn != null) {
      issues.push({ code: "prediction_fields", message: "预测不可用时概率与预期收益必须为 null" });
    }
  }
  if (report.synthesis.outlook === "uncertain" && report.synthesis.recommendation === "watch") {
    issues.push({ code: "stance", message: "outlook 为 uncertain 时 recommendation 不能是 watch" });
  }
  return issues;
}

export function knownEvidenceIds(evidence: Evidence[]): Set<string> {
  return new Set(evidence.map((e) => e.id));
}
