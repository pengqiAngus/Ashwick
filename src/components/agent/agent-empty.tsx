"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";
import { AgentSettingsDialog } from "@/components/agent/agent-settings-dialog";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { apiFetch, errorMessage } from "@/lib/client-api";
import type { CreateConversationResponse } from "@/lib/agent/schemas";

/** 示例问题：只是填入输入框，不会自动发送 */
const EXAMPLES = ["分析一下 BTC 接下来 24 小时的走势。", "帮我看看 ETH 目前是趋势行情还是震荡行情。", "分析 SOL 的支撑、阻力和主要风险。"];

/** 空白会话页：创建会话 + 首条消息后跳转，由会话页启动分析 */
export function AgentEmpty({ modelConfigured }: { modelConfigured: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"ready" | "submitted">("ready");
  const launchIdRef = useRef<string | null>(null);

  const submit = useCallback(
    async ({ text }: { text: string }) => {
      const t = text.trim();
      if (!t || status === "submitted") return;
      // 同一次提交（含网络重试）复用同一个 launchId，保证服务端幂等
      launchIdRef.current ??= crypto.randomUUID();
      setStatus("submitted");
      try {
        const res = await apiFetch<CreateConversationResponse>("/api/agent/conversations", {
          method: "POST",
          body: JSON.stringify({ source: "manual", text: t, launchId: launchIdRef.current }),
        });
        router.replace(`/agent/${encodeURIComponent(res.conversationId)}`);
      } catch (err) {
        toast.error(errorMessage(err, "创建会话失败"));
        setStatus("ready");
      }
    },
    [router, status],
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 pb-16 pt-[clamp(3rem,14vh,9rem)]">
      <header className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <span />
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <SparklesIcon className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Agent 分析工作台</h1>
          <p className="max-w-md text-sm text-muted-foreground">基于币安 USDT 现货已收盘 K 线做多周期技术分析与多空研究。这是研究工具，不构成投资建议，也不连接交易账户。</p>
          {!modelConfigured && <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">尚未配置模型服务。请点右上角设置填写，或配置环境变量 AI_PROVIDER_*。可以创建会话，但分析会提示不可用。</p>}
        </div>
        <div className="justify-self-end">
          <AgentSettingsDialog />
        </div>
      </header>

      <PromptInput onSubmit={submit}>
        <PromptInputBody>
          <PromptInputTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="例如：分析一下 BTC 接下来 24 小时的走势" autoFocus aria-label="消息输入框" />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <span className="px-1.5 text-[11px] text-muted-foreground">Enter 发送 · Shift+Enter 换行</span>
          </PromptInputTools>
          <PromptInputSubmit status={status} disabled={input.trim().length === 0 || status === "submitted"} />
        </PromptInputFooter>
      </PromptInput>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">示例问题（点击填入输入框，确认后再发送）</p>
        <Suggestions>
          {EXAMPLES.map((s) => (
            <Suggestion key={s} suggestion={s} onClick={setInput} className="text-xs" />
          ))}
        </Suggestions>
      </div>
    </div>
  );
}
