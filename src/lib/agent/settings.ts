import { serverEnv } from "@/lib/env";

export const AGENT_SETTINGS_ID = "default";

/** 环境变量快照。modelSynth 是原始值，不含回退到 analyst。 */
export type AgentSettingsSource = {
  providerName: string;
  providerBaseUrl: string | null;
  providerApiKey: string | null;
  modelAnalyst: string | null;
  modelSynth: string | null;
  supportsStructuredOutputsRaw: string | undefined;
  structuredOutputModeRaw: string | undefined;
  maxRunMs: number;
  maxModelCalls: number;
  debateRounds: number;
  maxInputChars: number;
  riskMode: "fast" | "deep";
};

/** 数据库覆盖。null 表示该字段继续用环境变量。 */
export type AgentSettingsOverride = {
  providerName: string | null;
  providerBaseUrl: string | null;
  providerApiKey: string | null;
  modelAnalyst: string | null;
  modelSynth: string | null;
  supportsStructuredOutputs: boolean | null;
  maxRunMs: number | null;
  maxModelCalls: number | null;
  debateRounds: number | null;
  maxInputChars: number | null;
  riskMode: string | null;
};

/** 合并后的有效配置。modelSynth 已回退到 analyst。 */
export type ResolvedAgentSettings = Omit<AgentSettingsSource, "modelSynth"> & {
  modelSynth: string | null;
};

export type AgentSettingsPublic = {
  providerName: string;
  providerBaseUrl: string;
  apiKeySet: boolean;
  apiKeyHint: string;
  modelAnalyst: string;
  modelSynth: string;
  supportsStructuredOutputs: boolean;
  maxRunMs: number;
  maxModelCalls: number;
  debateRounds: number;
  maxInputChars: number;
  riskMode: "fast" | "deep";
  overridden: boolean;
};

export type AgentSettingsInput = {
  providerName: string;
  providerBaseUrl: string;
  /** 空字符串表示不修改已保存的密钥 */
  apiKey?: string;
  modelAnalyst: string;
  modelSynth: string;
  supportsStructuredOutputs: boolean;
  maxRunMs: number;
  maxModelCalls: number;
  debateRounds: number;
  maxInputChars: number;
  riskMode: "fast" | "deep";
};

const g = globalThis as unknown as { __agentSettings?: ResolvedAgentSettings };

function nonempty(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export function readEnvSettings(): AgentSettingsSource {
  return {
    providerName: serverEnv.aiProviderName,
    providerBaseUrl: serverEnv.aiProviderBaseUrl,
    providerApiKey: serverEnv.aiProviderApiKey,
    modelAnalyst: serverEnv.aiModelAnalyst,
    modelSynth: process.env.AI_MODEL_SYNTH?.trim() || null,
    supportsStructuredOutputsRaw: serverEnv.aiSupportsStructuredOutputsRaw,
    structuredOutputModeRaw: serverEnv.aiStructuredOutputModeRaw,
    maxRunMs: serverEnv.agentMaxRunMs,
    maxModelCalls: serverEnv.agentMaxModelCalls,
    debateRounds: serverEnv.agentDebateRounds,
    maxInputChars: serverEnv.agentMaxInputChars,
    riskMode: serverEnv.agentRiskMode,
  };
}

export function mergeAgentSettings(env: AgentSettingsSource, row: AgentSettingsOverride | null): ResolvedAgentSettings {
  if (!row) {
    return { ...env, modelSynth: nonempty(env.modelSynth) ?? env.modelAnalyst };
  }
  const baseUrl = nonempty(row.providerBaseUrl);
  const modelAnalyst = nonempty(row.modelAnalyst) ?? env.modelAnalyst;
  const riskMode = row.riskMode === "fast" || row.riskMode === "deep" ? row.riskMode : env.riskMode;
  return {
    providerName: nonempty(row.providerName) ?? env.providerName,
    providerBaseUrl: baseUrl ? baseUrl.replace(/\/+$/, "") : env.providerBaseUrl,
    providerApiKey: nonempty(row.providerApiKey) ?? env.providerApiKey,
    modelAnalyst,
    modelSynth: nonempty(row.modelSynth) ?? nonempty(env.modelSynth) ?? modelAnalyst,
    supportsStructuredOutputsRaw: row.supportsStructuredOutputs == null ? env.supportsStructuredOutputsRaw : row.supportsStructuredOutputs ? "true" : "false",
    structuredOutputModeRaw: env.structuredOutputModeRaw,
    maxRunMs: row.maxRunMs ?? env.maxRunMs,
    maxModelCalls: row.maxModelCalls ?? env.maxModelCalls,
    debateRounds: row.debateRounds ?? env.debateRounds,
    maxInputChars: row.maxInputChars ?? env.maxInputChars,
    riskMode,
  };
}

export function toPublicSettings(resolved: ResolvedAgentSettings, overridden: boolean): AgentSettingsPublic {
  const key = resolved.providerApiKey;
  return {
    providerName: resolved.providerName,
    providerBaseUrl: resolved.providerBaseUrl ?? "",
    apiKeySet: Boolean(key),
    apiKeyHint: key ? key.slice(-4) : "",
    modelAnalyst: resolved.modelAnalyst ?? "",
    modelSynth: resolved.modelSynth ?? "",
    supportsStructuredOutputs: resolved.supportsStructuredOutputsRaw?.toLowerCase() !== "false",
    maxRunMs: resolved.maxRunMs,
    maxModelCalls: resolved.maxModelCalls,
    debateRounds: resolved.debateRounds,
    maxInputChars: resolved.maxInputChars,
    riskMode: resolved.riskMode,
    overridden,
  };
}

/** 缓存未加载时直接用环境变量，不访问数据库。 */
export function agentSettings(): ResolvedAgentSettings {
  return g.__agentSettings ?? mergeAgentSettings(readEnvSettings(), null);
}

function remember(resolved: ResolvedAgentSettings): void {
  g.__agentSettings = resolved;
}

async function db() {
  const { getDb } = await import("@/lib/db");
  return getDb();
}

function asOverride(row: AgentSettingsOverride): AgentSettingsOverride {
  return {
    providerName: row.providerName,
    providerBaseUrl: row.providerBaseUrl,
    providerApiKey: row.providerApiKey,
    modelAnalyst: row.modelAnalyst,
    modelSynth: row.modelSynth,
    supportsStructuredOutputs: row.supportsStructuredOutputs,
    maxRunMs: row.maxRunMs,
    maxModelCalls: row.maxModelCalls,
    debateRounds: row.debateRounds,
    maxInputChars: row.maxInputChars,
    riskMode: row.riskMode,
  };
}

export async function loadAgentSettings(): Promise<ResolvedAgentSettings> {
  const row = await (await db()).agentSetting.findUnique({ where: { id: AGENT_SETTINGS_ID } });
  const resolved = mergeAgentSettings(readEnvSettings(), row ? asOverride(row) : null);
  remember(resolved);
  return resolved;
}

export async function getAgentSettingsPublic(): Promise<AgentSettingsPublic> {
  const row = await (await db()).agentSetting.findUnique({ where: { id: AGENT_SETTINGS_ID } });
  const resolved = mergeAgentSettings(readEnvSettings(), row ? asOverride(row) : null);
  remember(resolved);
  return toPublicSettings(resolved, row != null);
}

export function cleanSettingsInput(input: AgentSettingsInput, existingKey: string | null): AgentSettingsOverride {
  const baseUrl = nonempty(input.providerBaseUrl);
  return {
    providerName: nonempty(input.providerName),
    providerBaseUrl: baseUrl ? baseUrl.replace(/\/+$/, "") : null,
    providerApiKey: nonempty(input.apiKey) ?? existingKey,
    modelAnalyst: nonempty(input.modelAnalyst),
    modelSynth: nonempty(input.modelSynth),
    supportsStructuredOutputs: input.supportsStructuredOutputs,
    maxRunMs: input.maxRunMs,
    maxModelCalls: input.maxModelCalls,
    debateRounds: input.debateRounds,
    maxInputChars: input.maxInputChars,
    riskMode: input.riskMode,
  };
}

export function assertSettingsUrl(url: string | null): void {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("模型服务地址不是合法 URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("模型服务地址只支持 http 或 https");
  }
}

export async function saveAgentSettings(input: AgentSettingsInput): Promise<AgentSettingsPublic> {
  const client = await db();
  const existing = await client.agentSetting.findUnique({ where: { id: AGENT_SETTINGS_ID } });
  const data = cleanSettingsInput(input, existing?.providerApiKey ?? null);
  assertSettingsUrl(data.providerBaseUrl);
  const row = await client.agentSetting.upsert({
    where: { id: AGENT_SETTINGS_ID },
    create: { id: AGENT_SETTINGS_ID, ...data },
    update: data,
  });
  const resolved = mergeAgentSettings(readEnvSettings(), asOverride(row));
  remember(resolved);
  return toPublicSettings(resolved, true);
}

export async function resetAgentSettings(): Promise<AgentSettingsPublic> {
  await (await db()).agentSetting.deleteMany({ where: { id: AGENT_SETTINGS_ID } });
  const resolved = mergeAgentSettings(readEnvSettings(), null);
  remember(resolved);
  return toPublicSettings(resolved, false);
}
