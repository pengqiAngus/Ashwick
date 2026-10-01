"use client";

/**
 * 基于 AI Elements `tool` 适配 Base UI Collapsible：
 * - 状态选择器使用 data-open / data-closed / data-panel-open
 * - 不依赖 shiki 代码块，直接渲染格式化 JSON
 */
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, ChevronDownIcon, ClockIcon, WrenchIcon, XCircleIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn("group not-prose w-full rounded-lg border border-border bg-card/60", className)} {...props} />
);

export type ToolState = "running" | "completed" | "failed";

const statusLabels: Record<ToolState, string> = { running: "执行中", completed: "已完成", failed: "失败" };

const statusIcons: Record<ToolState, ReactNode> = {
  running: <ClockIcon className="size-3.5 text-primary" aria-hidden />,
  completed: <CheckCircleIcon className="size-3.5 text-up" aria-hidden />,
  failed: <XCircleIcon className="size-3.5 text-destructive" aria-hidden />,
};

export const getStatusBadge = (status: ToolState) => (
  <Badge className="gap-1 rounded-full text-[11px]" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
  state: ToolState;
  meta?: string;
};

export const ToolHeader = ({ className, title, state, meta, ...props }: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-(--dur-fast) hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
      className,
    )}
    {...props}
  >
    <div className="flex min-w-0 items-center gap-2">
      <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-sm font-medium">{title}</span>
      {getStatusBadge(state)}
      {meta && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{meta}</span>}
    </div>
    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur) group-data-open:rotate-180" aria-hidden />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-(--dur) ease-(--ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0",
      className,
    )}
    {...props}
  >
    <div className="space-y-3 border-t border-border px-3 py-3 text-sm">{props.children}</div>
  </CollapsibleContent>
);

export const JsonBlock = ({ value, className }: { value: unknown; className?: string }) => (
  <pre className={cn("max-h-72 overflow-auto rounded-md bg-background/70 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground", className)}>
    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
  </pre>
);

export type ToolInputProps = ComponentProps<"div"> & { input: unknown };

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5 overflow-hidden", className)} {...props}>
    <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">参数</h4>
    <JsonBlock value={input} />
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & { output?: unknown; errorText?: string | null };

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (output === undefined && !errorText) return null;
  let body: ReactNode = null;
  if (isValidElement(output)) body = output;
  else if (output !== undefined && output !== null) body = <JsonBlock value={output} />;
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{errorText ? "错误" : "结果"}</h4>
      {errorText && <div className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{errorText}</div>}
      {body}
    </div>
  );
};
