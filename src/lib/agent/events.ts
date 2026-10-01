import type { AgentUIMessage, AnalysisReport, NoticeData, RunData, RunError, SnapshotMeta, StepData, ToolData } from "@/lib/agent/schemas";
import type { InferUIMessageChunk } from "ai";

/** 编排器产生的运行事件：同一事件同时写入数据库与 UI 流 */
export type RunEvent =
  | { type: "run"; data: RunData }
  | { type: "step"; data: StepData }
  | { type: "tool"; data: ToolData }
  | { type: "snapshot"; data: SnapshotMeta }
  | { type: "report"; data: AnalysisReport }
  | { type: "notice"; data: NoticeData }
  | { type: "error"; data: RunError }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "done"; outcome: "completed" | "failed" | "cancelled" };

export type AgentUIChunk = InferUIMessageChunk<AgentUIMessage>;

/** 运行事件 → AI SDK UI message chunk。稳定 id 保证同一步骤在客户端原地更新 */
export function eventToChunk(ev: RunEvent): AgentUIChunk | null {
  switch (ev.type) {
    case "run":
      return { type: "data-run", id: "run", data: ev.data };
    case "step":
      return { type: "data-step", id: `step:${ev.data.stepId}`, data: ev.data };
    case "tool":
      return { type: "data-tool", id: `tool:${ev.data.toolId}`, data: ev.data };
    case "snapshot":
      return { type: "data-snapshot", id: "snapshot", data: ev.data };
    case "report":
      return { type: "data-report", id: "report", data: ev.data };
    case "notice":
      return { type: "data-notice", data: ev.data, transient: true };
    case "error":
      return { type: "data-error", id: "error", data: ev.data };
    case "text-start":
      return { type: "text-start", id: ev.id };
    case "text-delta":
      return { type: "text-delta", id: ev.id, delta: ev.delta };
    case "text-end":
      return { type: "text-end", id: ev.id };
    case "done":
      return null;
  }
}
