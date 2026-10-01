"use client";

/** 基于 AI Elements `task` 适配 Base UI Collapsible（data-open / data-starting-style 等） */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({ defaultOpen = true, className, ...props }: TaskProps) => (
  <Collapsible className={cn("group not-prose w-full", className)} defaultOpen={defaultOpen} {...props} />
);

export type TaskTriggerProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "title"> & { label: ReactNode; meta?: ReactNode };

export const TaskTrigger = ({ children, className, label, meta, ...props }: TaskTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-3 rounded-md px-1 py-1.5 text-left text-sm outline-none transition-colors duration-(--dur-fast) hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <span className="truncate font-medium text-foreground">{label}</span>
          {meta && <span className="truncate text-xs">{meta}</span>}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur) group-data-open:rotate-180" aria-hidden />
      </>
    )}
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({ children, className, ...props }: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-(--dur) ease-(--ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0",
      className,
    )}
    {...props}
  >
    <div className="mt-1 space-y-1 border-l border-border pl-3">{children}</div>
  </CollapsibleContent>
);

export type TaskItemProps = ComponentProps<"div">;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div className={cn("flex items-start gap-2 py-1 text-sm text-muted-foreground", className)} {...props}>
    {children}
  </div>
);
