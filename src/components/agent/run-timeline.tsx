"use client";

import { motion } from "motion/react";
import { AlertCircleIcon, CheckIcon, CircleDashedIcon, MinusIcon, XIcon } from "lucide-react";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { cn } from "@/lib/utils";
import type { RunData, StepData } from "@/lib/agent/schemas";

const RUN_LABEL: Record<RunData["status"], string> = {
  queued: "排队中",
  running: "分析中",
  cancelling: "正在停止",
  completed: "已完成",
  failed: "失败",
  cancelled: "已停止",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function StatusIcon({ status }: { status: StepData["status"] }) {
  switch (status) {
    case "running":
      return (
        <span className="relative flex size-4 items-center justify-center" aria-hidden>
          <motion.span
            className="absolute inline-flex size-2.5 rounded-full bg-primary/50"
            animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
      );
    case "completed":
      return <CheckIcon className="size-4 text-up" aria-hidden />;
    case "failed":
      return <XIcon className="size-4 text-destructive" aria-hidden />;
    case "skipped":
      return <MinusIcon className="size-4 text-muted-foreground" aria-hidden />;
    case "cancelled":
      return <AlertCircleIcon className="size-4 text-muted-foreground" aria-hidden />;
    default:
      return <CircleDashedIcon className="size-4 text-muted-foreground/60" aria-hidden />;
  }
}

export function RunTimeline({ run, steps, onRetry }: { run: RunData | null; steps: StepData[]; onRetry?: () => void }) {
  if (steps.length === 0 && !run) return null;
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const done = ordered.filter((s) => s.status === "completed").length;
  const active = run?.status === "running" || run?.status === "queued" || run?.status === "cancelling";
  const current = ordered.find((s) => s.status === "running");
  const failed = ordered.find((s) => s.status === "failed");
  const title = active ? (current ? `正在${current.name}` : RUN_LABEL[run!.status]) : run ? RUN_LABEL[run.status] : "执行步骤";
  const totalMs = ordered.reduce((a, s) => a + (s.durationMs ?? 0), 0);

  return (
    <Task defaultOpen={active || Boolean(failed)} className="rounded-lg border border-border bg-card/60 px-2 py-1">
      <TaskTrigger
        label={
          <span className="inline-flex items-center gap-2">
            {active && <StatusIcon status="running" />}
            {title}
          </span>
        }
        meta={`${done}/${ordered.length} 步${totalMs > 0 && !active ? ` · ${formatDuration(totalMs)}` : ""}`}
        aria-live="polite"
      />
      <TaskContent>
        {ordered.map((s) => (
          <TaskItem key={s.stepId} className={cn(s.status === "pending" && "opacity-60")}>
            <span className="mt-0.5 shrink-0">
              <StatusIcon status={s.status} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate", s.status === "running" && "text-foreground")}>{s.name}</span>
                {s.durationMs != null && s.status !== "pending" && <span className="tabular shrink-0 text-[11px] text-muted-foreground/80">{formatDuration(s.durationMs)}</span>}
              </span>
              {s.summary && s.status !== "failed" && <span className="text-xs text-muted-foreground/90">{s.summary}</span>}
              {s.status === "failed" && s.error && (
                <span className="text-xs text-destructive">
                  {s.error.message}
                  {s.error.retryable !== false && onRetry && (
                    <button type="button" onClick={onRetry} className="ml-2 underline underline-offset-2 hover:text-foreground">
                      重试
                    </button>
                  )}
                </span>
              )}
            </span>
          </TaskItem>
        ))}
      </TaskContent>
    </Task>
  );
}
