import type { AgentUIMessage, AnalysisReport, RunData, RunError, SnapshotMeta, StepData, ToolData } from "@/lib/agent/schemas";
import type { RunEvent } from "@/lib/agent/events";

export interface AssistantState {
  run: RunData | null;
  steps: Map<string, StepData>;
  tools: Map<string, ToolData>;
  snapshot: SnapshotMeta | null;
  report: AnalysisReport | null;
  error: RunError | null;
  /** 叙述文本（按 text id 累积） */
  texts: Map<string, { text: string; done: boolean }>;
}

export function createAssistantState(): AssistantState {
  return { run: null, steps: new Map(), tools: new Map(), snapshot: null, report: null, error: null, texts: new Map() };
}

/** 把一个运行事件并入状态（与客户端 useChat 的 id 归并语义一致） */
export function applyEvent(state: AssistantState, ev: RunEvent): AssistantState {
  switch (ev.type) {
    case "run":
      state.run = ev.data;
      break;
    case "step":
      state.steps.set(ev.data.stepId, ev.data);
      break;
    case "tool":
      state.tools.set(ev.data.toolId, ev.data);
      break;
    case "snapshot":
      state.snapshot = ev.data;
      break;
    case "report":
      state.report = ev.data;
      break;
    case "error":
      state.error = ev.data;
      break;
    case "text-start":
      if (!state.texts.has(ev.id)) state.texts.set(ev.id, { text: "", done: false });
      break;
    case "text-delta": {
      const t = state.texts.get(ev.id) ?? { text: "", done: false };
      t.text += ev.delta;
      state.texts.set(ev.id, t);
      break;
    }
    case "text-end": {
      const t = state.texts.get(ev.id);
      if (t) t.done = true;
      break;
    }
    case "notice":
    case "done":
      break;
  }
  return state;
}

/**
 * 由状态生成 assistant 消息的 parts。顺序与流式写入顺序一致：
 * run → steps(按 order) → tools → snapshot → report → text → error
 */
export function composeAssistantParts(state: AssistantState): AgentUIMessage["parts"] {
  const parts: AgentUIMessage["parts"] = [];
  if (state.run) parts.push({ type: "data-run", id: "run", data: state.run });
  for (const s of [...state.steps.values()].sort((a, b) => a.order - b.order)) {
    parts.push({ type: "data-step", id: `step:${s.stepId}`, data: s });
  }
  for (const t of [...state.tools.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    parts.push({ type: "data-tool", id: `tool:${t.toolId}`, data: t });
  }
  if (state.snapshot) parts.push({ type: "data-snapshot", id: "snapshot", data: state.snapshot });
  if (state.report) parts.push({ type: "data-report", id: "report", data: state.report });
  for (const [, t] of state.texts) {
    if (t.text.length > 0) parts.push({ type: "text", text: t.text, state: t.done ? "done" : "streaming" });
  }
  if (state.error) parts.push({ type: "data-error", id: "error", data: state.error });
  return parts;
}

/** 从 parts 还原状态（用于重试时复用、或从数据库读取后继续） */
export function stateFromParts(parts: AgentUIMessage["parts"]): AssistantState {
  const state = createAssistantState();
  let i = 0;
  for (const p of parts) {
    switch (p.type) {
      case "data-run":
        state.run = p.data;
        break;
      case "data-step":
        state.steps.set(p.data.stepId, p.data);
        break;
      case "data-tool":
        state.tools.set(p.data.toolId, p.data);
        break;
      case "data-snapshot":
        state.snapshot = p.data;
        break;
      case "data-report":
        state.report = p.data;
        break;
      case "data-error":
        state.error = p.data;
        break;
      case "text":
        state.texts.set(`t${i++}`, { text: p.text, done: true });
        break;
      default:
        break;
    }
  }
  return state;
}
