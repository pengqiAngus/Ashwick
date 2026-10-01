import { describe, expect, it } from "vitest";
import { applyEvent, composeAssistantParts, createAssistantState, stateFromParts } from "@/lib/agent/compose-parts";
import { eventToChunk, type RunEvent } from "@/lib/agent/events";
import type { StepData } from "@/lib/agent/schemas";

const step = (stepId: string, order: number, status: StepData["status"]): StepData => ({
  stepId,
  order,
  name: stepId,
  status,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  summary: null,
  error: null,
  evidenceIds: [],
});

describe("composeAssistantParts", () => {
  it("同一步骤多次事件只保留一条 part，并按 order 排序；文本累积", () => {
    const events: RunEvent[] = [
      { type: "step", data: step("b", 1, "pending") },
      { type: "step", data: step("a", 0, "pending") },
      { type: "step", data: step("a", 0, "running") },
      { type: "step", data: step("a", 0, "completed") },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "你好" },
      { type: "text-delta", id: "t", delta: "，世界" },
      { type: "text-end", id: "t" },
      { type: "notice", data: { level: "info", code: "x", message: "m" } },
    ];
    const state = createAssistantState();
    for (const ev of events) applyEvent(state, ev);
    const parts = composeAssistantParts(state);
    const steps = parts.filter((p) => p.type === "data-step");
    expect(steps).toHaveLength(2);
    expect(steps.map((p) => (p as { data: StepData }).data.stepId)).toEqual(["a", "b"]);
    expect((steps[0] as { data: StepData }).data.status).toBe("completed");
    expect((steps[0] as { id?: string }).id).toBe("step:a");
    const text = parts.find((p) => p.type === "text");
    expect(text).toMatchObject({ type: "text", text: "你好，世界", state: "done" });
    // notice 是瞬态，不进入 parts
    expect(parts.some((p) => p.type === "data-notice")).toBe(false);
  });

  it("流式 chunk 的 id 与持久化 parts 的 id 一致", () => {
    const ev: RunEvent = { type: "step", data: step("features", 3, "running") };
    const chunk = eventToChunk(ev);
    expect(chunk).toMatchObject({ type: "data-step", id: "step:features" });
    const notice = eventToChunk({ type: "notice", data: { level: "warning", code: "c", message: "m" } });
    expect(notice).toMatchObject({ type: "data-notice", transient: true });
    expect(eventToChunk({ type: "done", outcome: "completed" })).toBeNull();
  });

  it("stateFromParts 能还原并再次合成相同结构", () => {
    const state = createAssistantState();
    applyEvent(state, { type: "step", data: step("a", 0, "completed") });
    applyEvent(state, { type: "text-start", id: "t" });
    applyEvent(state, { type: "text-delta", id: "t", delta: "abc" });
    applyEvent(state, { type: "text-end", id: "t" });
    applyEvent(state, { type: "error", data: { code: "e", message: "boom" } });
    const parts = composeAssistantParts(state);
    const again = composeAssistantParts(stateFromParts(parts));
    expect(again).toEqual(parts);
  });
});
