import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eventToChunk, type AgentUIChunk } from "@/lib/agent/events";
import { subscribe, type RunHandle } from "@/lib/agent/run-registry";
import type { AgentMetadata, AgentUIMessage } from "@/lib/agent/schemas";

/**
 * 把运行事件订阅为 AI SDK UI message stream。
 * 运行本身不依赖该流：客户端断开只是退订，不会停止分析。
 */
export function createRunStreamResponse(handle: RunHandle, opts: { runId: string; assistantMessageId: string; metadata: AgentMetadata }): Response {
  const stream = createUIMessageStream<AgentUIMessage>({
    execute: ({ writer }) =>
      new Promise<void>((resolve) => {
        let finished = false;
        let unsub: () => void = () => {};
        const end = (sendFinish: boolean) => {
          if (finished) return;
          finished = true;
          unsub();
          if (sendFinish) {
            try {
              writer.write({ type: "finish", messageMetadata: { ...opts.metadata, finishedAt: new Date().toISOString() } });
            } catch {
              /* 客户端已断开 */
            }
          }
          resolve();
        };
        const safeWrite = (chunk: AgentUIChunk) => {
          if (finished) return;
          try {
            writer.write(chunk);
          } catch {
            end(false);
          }
        };
        safeWrite({ type: "start", messageId: opts.assistantMessageId, messageMetadata: opts.metadata });
        unsub = subscribe(handle, (ev) => {
          if (ev.type === "done") {
            end(true);
            return;
          }
          const chunk = eventToChunk(ev);
          if (chunk) safeWrite(chunk);
        });
        if (handle.done && !finished) end(true);
      }),
    onError: (err) => (err instanceof Error ? err.message : "流处理错误"),
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-run-id": opts.runId, "cache-control": "no-store" } });
}
