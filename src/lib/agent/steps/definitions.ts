import type { RunKind } from "@/lib/agent/schemas";

export interface StepDef {
  id: string;
  name: string;
}

export const STEP: Record<string, StepDef> = {
  route_intent: { id: "route_intent", name: "识别请求意图" },
  resolve_symbol: { id: "resolve_symbol", name: "确认交易对" },
  fetch_data: { id: "fetch_data", name: "获取已收盘 K 线" },
  quality_check: { id: "quality_check", name: "数据质量检查" },
  features: { id: "features", name: "计算趋势、波动率与支撑阻力" },
  prediction: { id: "prediction", name: "调用量化预测" },
  technical_analyst: { id: "technical_analyst", name: "技术分析 Agent" },
  market_regime: { id: "market_regime", name: "市场状态 Agent" },
  bull_research: { id: "bull_research", name: "多头研究 Agent" },
  bear_research: { id: "bear_research", name: "空头研究 Agent" },
  research_synthesis: { id: "research_synthesis", name: "研究汇总 Agent" },
  trade_scenarios: { id: "trade_scenarios", name: "交易情景 Agent" },
  risk_assessment: { id: "risk_assessment", name: "风险评估" },
  validate: { id: "validate", name: "确定性校验" },
  final_report: { id: "final_report", name: "生成最终报告" },
  load_context: { id: "load_context", name: "读取历史报告与快照" },
  narrate: { id: "narrate", name: "生成回复" },
};

export const FULL_PIPELINE: StepDef[] = [
  STEP.resolve_symbol,
  STEP.fetch_data,
  STEP.quality_check,
  STEP.features,
  STEP.prediction,
  STEP.technical_analyst,
  STEP.market_regime,
  STEP.bull_research,
  STEP.bear_research,
  STEP.research_synthesis,
  STEP.trade_scenarios,
  STEP.risk_assessment,
  STEP.validate,
  STEP.final_report,
];

export const FOLLOWUP_PIPELINE: StepDef[] = [STEP.load_context, STEP.narrate];
export const CLARIFY_PIPELINE: StepDef[] = [STEP.narrate];

export function pipelineFor(kind: RunKind): StepDef[] {
  switch (kind) {
    case "full_analysis":
    case "refresh":
    case "change_horizon":
    case "switch_symbol":
      return FULL_PIPELINE;
    case "followup_explain":
    case "hypothetical":
      return FOLLOWUP_PIPELINE;
    case "clarify":
      return CLARIFY_PIPELINE;
    case "undetermined":
      return [];
  }
}
