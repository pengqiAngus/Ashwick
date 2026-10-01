"use client";

/**
 * 基于 AI Elements `message` 裁剪并适配 Base UI：
 * - 去掉分支（Branch）与 ButtonGroup
 * - TooltipTrigger 使用 Base UI 的 render 组合而非 Radix asChild
 * - Streamdown 只启用代码高亮插件
 */
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { code } from "@streamdown/code";
import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn("group flex w-full min-w-0 flex-col gap-2", from === "user" ? "is-user ml-auto max-w-[88%] items-end sm:max-w-[75%]" : "is-assistant", className)}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm leading-relaxed",
      "group-[.is-user]:rounded-2xl group-[.is-user]:rounded-br-md group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-2.5 group-[.is-user]:text-foreground group-[.is-user]:whitespace-pre-wrap",
      "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({ tooltip, children, label, variant = "ghost", size = "icon-sm", ...props }: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );
  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { code };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn("size-full text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      plugins={streamdownPlugins}
      parseIncompleteMarkdown
      {...props}
    />
  ),
  (prev, next) => prev.children === next.children && prev.isAnimating === next.isAnimating,
);
MessageResponse.displayName = "MessageResponse";
