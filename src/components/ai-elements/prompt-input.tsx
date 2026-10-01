"use client";

/**
 * 基于 AI Elements `prompt-input` 裁剪：仅保留文本输入、发送 / 停止；
 * 去掉附件、模型选择、命令菜单等依赖 Radix 组件的部分。
 */
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { ArrowUpIcon, SquareIcon, XIcon } from "lucide-react";
import type { ComponentProps, FormEvent, KeyboardEventHandler } from "react";
import { useCallback, useState } from "react";

export interface PromptInputMessage {
  text: string;
}

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export const PromptInput = ({ className, onSubmit, children, ...props }: PromptInputProps) => {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const textarea = form.querySelector("textarea");
      const text = textarea?.value ?? "";
      void onSubmit({ text }, event);
    },
    [onSubmit],
  );
  return (
    <form
      className={cn(
        "group/prompt w-full overflow-hidden rounded-2xl border border-input bg-card shadow-(--shadow-panel) transition-[border-color,box-shadow] duration-(--dur) ease-(--ease)",
        "has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:shadow-glow",
        className,
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  );
};

export type PromptInputBodyProps = ComponentProps<"div">;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => <div className={cn("flex flex-col", className)} {...props} />;

export type PromptInputTextareaProps = ComponentProps<typeof Textarea>;

export const PromptInputTextarea = ({ onKeyDown, className, placeholder = "输入问题…", ...props }: PromptInputTextareaProps) => {
  const [isComposing, setIsComposing] = useState(false);
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Enter") {
        if (isComposing || e.nativeEvent.isComposing || e.shiftKey) return;
        e.preventDefault();
        const form = e.currentTarget.form;
        const submit = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        if (submit?.disabled) return;
        form?.requestSubmit();
      }
    },
    [isComposing, onKeyDown],
  );
  return (
    <Textarea
      className={cn(
        "max-h-48 min-h-[3.25rem] w-full resize-none rounded-none border-none bg-transparent px-4 pt-3 pb-1 text-base shadow-none outline-none field-sizing-content focus-visible:ring-0 dark:bg-transparent md:text-sm",
        className,
      )}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
};

export type PromptInputFooterProps = ComponentProps<"div">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <div className={cn("flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1", className)} {...props} />
);

export type PromptInputToolsProps = ComponentProps<"div">;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export const PromptInputButton = ({ variant = "ghost", size = "sm", className, ...props }: PromptInputButtonProps) => (
  <Button className={cn("shrink-0", className)} size={size} type="button" variant={variant} {...props} />
);

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: ChatStatus | "cancelling";
  onStop?: () => void;
};

export const PromptInputSubmit = ({ className, variant = "default", size = "icon-sm", status, onStop, onClick, children, ...props }: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming" || status === "cancelling";
  let icon = <ArrowUpIcon className="size-4" aria-hidden />;
  if (status === "submitted" || status === "cancelling") icon = <Spinner className="size-4" />;
  else if (status === "streaming") icon = <SquareIcon className="size-3.5" aria-hidden />;
  else if (status === "error") icon = <XIcon className="size-4" aria-hidden />;
  const handleClick: NonNullable<ComponentProps<typeof Button>["onClick"]> = useCallback(
    (e) => {
      if (isGenerating && onStop) {
        e.preventDefault();
        onStop();
        return;
      }
      onClick?.(e);
    },
    [isGenerating, onStop, onClick],
  );
  return (
    <Button
      aria-label={isGenerating ? (status === "cancelling" ? "正在停止" : "停止") : "发送"}
      className={cn("rounded-full", className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={isGenerating ? "secondary" : variant}
      {...props}
    >
      {children ?? icon}
    </Button>
  );
};
