import { describe, expect, it } from "vitest";
import { mergeAgentSettings, type AgentSettingsOverride, type AgentSettingsSource } from "@/lib/agent/settings";

const env: AgentSettingsSource = {
  providerName: "openai-compatible",
  providerBaseUrl: "https://env.example/v1",
  providerApiKey: "env-key-1234",
  modelAnalyst: "env-analyst",
  modelSynth: null,
  supportsStructuredOutputsRaw: "true",
  structuredOutputModeRaw: undefined,
  maxRunMs: 240_000,
  maxModelCalls: 14,
  debateRounds: 1,
  maxInputChars: 4_000,
  riskMode: "fast",
};

const empty: AgentSettingsOverride = {
  providerName: null,
  providerBaseUrl: null,
  providerApiKey: null,
  modelAnalyst: null,
  modelSynth: null,
  supportsStructuredOutputs: null,
  maxRunMs: null,
  maxModelCalls: null,
  debateRounds: null,
  maxInputChars: null,
  riskMode: null,
};

describe("mergeAgentSettings", () => {
  it("没有覆盖行时使用环境变量，synth 回退到 analyst", () => {
    const merged = mergeAgentSettings(env, null);
    expect(merged.providerBaseUrl).toBe(env.providerBaseUrl);
    expect(merged.providerApiKey).toBe(env.providerApiKey);
    expect(merged.modelSynth).toBe("env-analyst");
    expect(merged.riskMode).toBe("fast");
  });

  it("非空覆盖优先，空字段继续用环境变量", () => {
    const merged = mergeAgentSettings(env, {
      ...empty,
      providerBaseUrl: "https://override.example/v1/",
      providerApiKey: "override-key",
      supportsStructuredOutputs: false,
      maxRunMs: 60_000,
      riskMode: "deep",
    });
    expect(merged.providerBaseUrl).toBe("https://override.example/v1");
    expect(merged.providerApiKey).toBe("override-key");
    expect(merged.providerName).toBe("openai-compatible");
    expect(merged.modelAnalyst).toBe("env-analyst");
    expect(merged.supportsStructuredOutputsRaw).toBe("false");
    expect(merged.maxRunMs).toBe(60_000);
    expect(merged.maxModelCalls).toBe(14);
    expect(merged.riskMode).toBe("deep");
  });

  it("只覆盖 analyst 时 synth 跟着新的 analyst", () => {
    const merged = mergeAgentSettings(env, { ...empty, modelAnalyst: "new-analyst" });
    expect(merged.modelAnalyst).toBe("new-analyst");
    expect(merged.modelSynth).toBe("new-analyst");
  });

  it("环境变量里的显式 synth 在未覆盖时保留", () => {
    const merged = mergeAgentSettings({ ...env, modelSynth: "env-synth" }, { ...empty, modelAnalyst: "new-analyst" });
    expect(merged.modelSynth).toBe("env-synth");
  });

  it("非法 riskMode 回退到环境变量", () => {
    expect(mergeAgentSettings(env, { ...empty, riskMode: "slow" }).riskMode).toBe("fast");
  });
});
