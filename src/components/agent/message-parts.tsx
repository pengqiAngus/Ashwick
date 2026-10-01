"use client";

import { motion } from "motion/react";
import { AlertCircleIcon } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { ReportCard } from "@/components/agent/report-card";
import { RunTimeline } from "@/components/agent/run-timeline";
import type { AgentUIMessage, ReportSummaryLike, RunData, StepData, ToolData } from "@/lib/agent/schemas";

/** 从 assistant 消息 parts 中拆出各类结构 */
export function splitParts(message: AgentUIMessage) {
  let run: RunData | null = null;
  const steps: StepData[] = [];
  const tools: ToolData[] = [];
  let report: ReportSummaryLike | null = null;
  let error: { code: string; message: string } | null = null;
  const texts: string[] = [];
  let streaming = false;
  for (const p of message.parts) {
    switch (p.type) {
      case "data-run":
        run = p.data;
        break;
      case "data-step":
        steps.push(p.data);
        break;
      case "data-tool":
        tools.push(p.data);
        break;
      case "data-report":
        report = p.data;
        break;
      case "data-error":
        error = p.data;
        break;
      case "text":
        texts.push(p.text);
        if (p.state === "streaming") streaming = true;
        break;
      default:
        break;
    }
  }
  return { run, steps, tools, report, error, text: texts.join("\n\n"), streaming };
}

export function UserMessage({ message }: { message: AgentUIMessage }) {
  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <Message from="user">
        <MessageContent>{text}</MessageContent>
      </Message>
    </motion.div>
  );
}

export function AssistantMessage({
  message,
  pricePrecision,
  isLive,
  onRetry,
}: {
  message: AgentUIMessage;
  pricePrecision: number;
  /** 该消息对应的运行是否正在进行（决定 Markdown 是否按流式渲染） */
  isLive: boolean;
  onRetry?: () => void;
}) {
  const { run, steps, tools, report, error, text, streaming } = splitParts(message);
  const empty = !run && steps.length === 0 && !report && !text && !error;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <Message from="assistant">
        <MessageContent className="gap-3">
          {empty && <p className="text-sm text-muted-foreground">（等待分析启动…）</p>}
          <RunTimeline run={run} steps={steps} onRetry={onRetry} />
          {tools.length > 0 && (
            <div className="flex flex-col gap-2">
              {tools.map((t) => (
                <Tool key={t.toolId} defaultOpen={false}>
                  <ToolHeader title={t.name} state={t.status} meta={t.durationMs != null ? `${(t.durationMs / 1000).toFixed(1)} s` : undefined} />
                  <ToolContent>
                    <ToolInput input={t.input} />
                    <ToolOutput output={t.output} errorText={t.error} />
                  </ToolContent>
                </Tool>
              ))}
            </div>
          )}
          {report && <ReportCard report={report} pricePrecision={pricePrecision} />}
          {text && <MessageResponse isAnimating={isLive && streaming}>{text}</MessageResponse>}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                {error.message}
                {onRetry && (
                  <button type="button" onClick={onRetry} className="ml-2 underline underline-offset-2 hover:text-foreground">
                    重试
                  </button>
                )}
              </span>
            </div>
          )}
        </MessageContent>
      </Message>
    </motion.div>
  );
}
