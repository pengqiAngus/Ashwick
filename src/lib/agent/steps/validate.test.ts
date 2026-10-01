import { describe, expect, it } from "vitest";
import type { AnalysisReport, Level } from "@/lib/agent/schemas";
import { filterEvidenceIds, normalizeStance, resolveScenarios, validateReport } from "@/lib/agent/steps/validate";

const lv = (id: string, side: Level["side"], price: number): Level => ({ id, side, price, method: "swing", touches: 1, interval: "1h", sourceBarTimes: [0], distancePct: 0 });

function baseReport(over: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    schemaVersion: 1,
    symbol: "BTCUSDT",
    exchange: "binance",
    marketType: "spot",
    dataCutoff: new Date(0).toISOString(),
    snapshotId: "s",
    intervals: ["1h"],
    horizon: "24h",
    dataQuality: { ok: true, perInterval: [], warnings: [] },
    regime: { label: "ranging", byInterval: [], evidence: [], version: "v" },
    indicators: [],
    levels: { support: [lv("lv:1h:0", "support", 100)], resistance: [lv("lv:1h:1", "resistance", 120)] },
    alignment: { score: 0, agree: false, detail: "" },
    technical: null,
    regimeView: null,
    bull: null,
    bear: null,
    synthesis: { outlook: "neutral", recommendation: "watch", rationale: "", conflicts: [], confidenceNote: "", evidenceIds: [] },
    scenarios: [],
    risks: { observed: [], dataGaps: [], assumed: [], summary: "" },
    prediction: { status: "unavailable", modelVersion: null, horizon: "24h", upProbability: null, expectedReturn: null, threshold: null, trainedUntil: null, note: "" },
    targetRange: null,
    unsupported: [],
    evidence: [{ id: "lv:1h:0", stepId: "features", kind: "level", text: "" }, { id: "lv:1h:1", stepId: "features", kind: "level", text: "" }],
    sources: [],
    summary: "",
    modelInfo: { provider: "p", analystModel: "a", synthModel: "s", promptVersion: "v" },
    createdAt: new Date(0).toISOString(),
    ...over,
  };
}

describe("resolveScenarios", () => {
  it("只解析已知价位 id，未知 id 被丢弃，无价位则为 null", () => {
    const levels = [lv("lv:1h:0", "support", 100), lv("lv:1h:1", "resistance", 120)];
    const out = resolveScenarios(
      {
        scenarios: [
          { name: "A", direction: "long", condition: "c", entryLevelIds: ["lv:1h:0", "lv:x"], stopLevelId: "lv:nope", targetLevelIds: ["lv:1h:1"], invalidation: "i" },
          { name: "B", direction: "none", condition: "c", entryLevelIds: [], stopLevelId: null, targetLevelIds: [], invalidation: "i" },
        ],
      },
      levels,
      new Set(levels.map((l) => l.id)),
    );
    expect(out[0].entryZone).toEqual({ low: 100, high: 100 });
    expect(out[0].stopRef).toBeNull();
    expect(out[0].targets).toEqual([120]);
    expect(out[0].evidenceIds).toEqual(["lv:1h:0", "lv:1h:1"]);
    expect(out[1].entryZone).toBeNull();
    expect(out[1].targets).toBeNull();
  });
});

describe("validateReport", () => {
  it("合法报告无问题", () => {
    expect(validateReport(baseReport())).toEqual([]);
  });
  it("预测不可用时概率必须为 null", () => {
    const r = baseReport({ prediction: { status: "unavailable", modelVersion: null, horizon: "24h", upProbability: 0.6, expectedReturn: null, threshold: null, trainedUntil: null, note: "" } });
    expect(validateReport(r).some((i) => i.code === "prediction_fields")).toBe(true);
  });
  it("情景价格必须来自支撑阻力", () => {
    const r = baseReport({ scenarios: [{ name: "X", direction: "long", condition: "", entryZone: { low: 99, high: 99 }, stopRef: null, targets: null, invalidation: "", evidenceIds: [] }] });
    expect(validateReport(r).some((i) => i.code === "scenario_price")).toBe(true);
  });
  it("uncertain + watch 不合法，normalizeStance 修正", () => {
    expect(normalizeStance("uncertain", "watch")).toEqual({ outlook: "uncertain", recommendation: "wait_confirmation" });
    const r = baseReport({ synthesis: { outlook: "uncertain", recommendation: "watch", rationale: "", conflicts: [], confidenceNote: "", evidenceIds: [] } });
    expect(validateReport(r).some((i) => i.code === "stance")).toBe(true);
  });
  it("filterEvidenceIds 丢弃未知 id", () => {
    expect(filterEvidenceIds(["a", "b"], new Set(["a"]))).toEqual(["a"]);
  });
});
