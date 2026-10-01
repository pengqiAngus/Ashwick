"use client";

/** 基于 AI Elements `sources` 适配 Base UI Collapsible */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => <Collapsible className={cn("group not-prose text-xs text-primary", className)} {...props} />;

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & { count: number };

export const SourcesTrigger = ({ className, count, children, ...props }: SourcesTriggerProps) => (
  <CollapsibleTrigger className={cn("flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)} {...props}>
    {children ?? (
      <>
        <p className="font-medium">引用 {count} 个数据来源</p>
        <ChevronDownIcon className="size-3.5 transition-transform duration-(--dur) group-data-open:rotate-180" aria-hidden />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({ className, children, ...props }: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-(--dur) ease-(--ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0",
      className,
    )}
    {...props}
  >
    <div className="mt-2 flex w-fit flex-col gap-1.5">{children}</div>
  </CollapsibleContent>
);

export type SourceProps = ComponentProps<"div"> & { title: string };

export const Source = ({ title, children, className, ...props }: SourceProps) => (
  <div className={cn("flex items-start gap-2 text-muted-foreground", className)} {...props}>
    {children ?? (
      <>
        <BookIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="block">{title}</span>
      </>
    )}
  </div>
);
