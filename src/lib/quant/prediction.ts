/**
 * 量化预测接口（阶段 4 占位）。
 * 当前没有训练好的模型，因此始终返回“预测不可用”，所有概率 / 收益字段为 null。
 * 阶段 4 只替换此函数实现，不改变返回结构。
 */
import type { Horizon, PredictionResult } from "@/lib/agent/schemas";

export const PREDICTION_MODEL_VERSION: string | null = null;

export function predict(_input: { symbol: string; horizon: Horizon; snapshotId: string }): PredictionResult {
  return {
    status: "unavailable",
    modelVersion: PREDICTION_MODEL_VERSION,
    horizon: _input.horizon,
    upProbability: null,
    expectedReturn: null,
    threshold: null,
    trainedUntil: null,
    note: "量化预测模型尚未训练与验证，本次仅提供技术分析；不以模型自报的“信心”替代概率。",
  };
}
