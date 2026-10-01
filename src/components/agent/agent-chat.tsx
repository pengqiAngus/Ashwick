"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { AlertCircleIcon, RotateCcwIcon } from "lucide-react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import { AssistantMessage, UserMessage, splitParts } from "@/components/agent/message-parts";
import { ContextPanel } from "@/components/agent/context-panel";
import { useRunPoll } from "@/hooks/use-run-poll";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/client-api";
import { RUN_ACTIVE_STATUSES, type AgentUIMessage, type ApiErrorBodyLike, type ConversationView, type RunDetail } from "@/lib/agent/schemas";

const FOLLOWUPS = ["为什么你认为目前是这个状态？", "你提到的支撑位是怎么算出来的？", "如果跌破最近的支撑位，结论会怎样变化？", "刷新一下数据"];

class ConflictError extends Error {
  constructor(
    readonly runId: string | null,
    readonly status: string | null,
  ) {
    super("conflict");
    this.name = "ConflictError";
  }
}

/** 会话页主体：两种入口共用同一套提交与运行逻辑 */
export function AgentChat({ initialView, pricePrecision }: { initialView: ConversationView; pricePrecision: number }) {
  const conversationId = initialView.conversation.id;
  const [view, setView] = useState(initialView);
  /** 需要跟随（轮询）的运行：刷新恢复 / 409 冲突 / 断流 */
  const [followRunId, setFollowRunId] = useState<string | null>(initialView.activeRun?.runId ?? null);
  const [cancelling, setCancelling] = useState(false);
  const [input, setInput] = useState("");
  const currentRunIdRef = useRef<string | null>(initialView.activeRun?.runId ?? null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<AgentUIMessage>({
        api: "/api/agent/chat",
        prepareSendMessagesRequest: ({ messages, body }) => {
          const pendingMessageId = (body as { pendingMessageId?: string } | undefined)?.pendingMessageId;
          if (pendingMessageId) return { body: { conversationId, pendingMessageId } };
          const last = [...messages].reverse().find((m) => m.role === "user");
          return { body: { conversationId, message: last ? { id: last.id, role: last.role, parts: last.parts.filter((p) => p.type === "text") } : null } };
        },
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (res.ok) {
            currentRunIdRef.current = res.headers.get("x-run-id");
            return res;
          }
          let body: ApiErrorBodyLike | null = null;
          try {
            body = (await res.clone().json()) as ApiErrorBodyLike;
          } catch {
            /* ignore */
          }
          if (res.status === 409) {
            const d = body?.error?.details ?? {};
            throw new ConflictError(typeof d.runId === "string" ? d.runId : null, typeof d.status === "string" ? d.status : null);
          }
          const kind = body?.error?.kind ?? "bad_request";
          throw new ApiClientError(kind, body?.error?.message ?? `请求失败（HTTP ${res.status}）`, res.status, body?.error?.retryAfterSec, body?.error?.details);
        },
      }),
    [conversationId],
  );

  const { messages, sendMessage, status, stop, setMessages, error, clearError } = useChat<AgentUIMessage>({
    id: conversationId,
    messages: initialView.messages,
    transport,
    onData: (part) => {
      if (part.type === "data-notice") {
        const n = part.data;
        if (n.level === "warning") toast.warning(n.message);
        else toast.message(n.message);
      }
    },
    onError: (err) => {
      if (err instanceof ConflictError) {
        if (err.runId && err.status && (RUN_ACTIVE_STATUSES as string[]).includes(err.status)) {
          setFollowRunId(err.runId);
          toast.message("已有正在进行的分析，正在同步进度");
        } else {
          toast.message("该消息已处理，正在同步结果");
          void refreshView();
        }
        return;
      }
      toast.error(errorMessage(err, "发送失败"));
    },
    onFinish: () => {
      setCancelling(false);
      void refreshView();
    },
  });

  const refreshView = useCallback(async () => {
    try {
      const v = await apiFetch<ConversationView>(`/api/agent/conversations/${encodeURIComponent(conversationId)}`);
      setView(v);
      if (v.activeRun) setFollowRunId(v.activeRun.runId);
    } catch {
      /* 视图刷新失败不影响聊天 */
    }
  }, [conversationId]);

  /* ---------- 模式 A：自动启动待处理首条消息（只启动一次） ---------- */
  // 延后到宏任务：Strict Mode 会先跑 effect 再 cleanup。立刻 send 会被 useChat 卸载时的 stop() 取消，
  // 而 kicked 已经锁上，第二次 effect 不再发。定时器在双调用之后才真正发送。
  const kicked = useRef<string | null>(null);
  const pendingMessageId = view.pendingMessageId;
  const hasActive = Boolean(followRunId) || status === "submitted" || status === "streaming";
  useEffect(() => {
    if (!pendingMessageId || hasActive) return;
    if (kicked.current === pendingMessageId) return;
    const id = pendingMessageId;
    const timer = setTimeout(() => {
      kicked.current = id;
      void sendMessage(undefined, { body: { pendingMessageId: id } });
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingMessageId, hasActive, sendMessage]);

  /* ---------- 跟随已有运行（刷新 / 多标签 / 断流） ---------- */
  const applyRunDetail = useCallback(
    (detail: RunDetail) => {
      if (detail.assistantMessage) {
        const am = detail.assistantMessage;
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === am.id);
          if (idx === -1) return [...prev, am];
          const next = [...prev];
          next[idx] = am;
          return next;
        });
      }
      if (!(RUN_ACTIVE_STATUSES as string[]).includes(detail.run.status)) {
        setFollowRunId(null);
        setCancelling(false);
        void refreshView();
      }
    },
    [refreshView, setMessages],
  );
  const poll = useRunPoll(status === "submitted" || status === "streaming" ? null : followRunId, applyRunDetail);

  /* ---------- 停止 ---------- */
  const handleStop = useCallback(async () => {
    const runId = currentRunIdRef.current ?? followRunId ?? liveRunId(messages);
    setCancelling(true);
    try {
      if (runId) await apiFetch(`/api/agent/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
    } catch (err) {
      toast.error(errorMessage(err, "停止失败"));
    }
    stop();
    if (runId) setFollowRunId(runId); // 跟随到服务端确认 cancelled
  }, [followRunId, messages, stop]);

  /* ---------- 重试 ---------- */
  const retryableId = view.retryableMessageId;
  const handleRetry = useCallback(() => {
    if (!retryableId || hasActive) return;
    clearError();
    // 重置对应 assistant 气泡的旧内容，服务端会复用同一条消息
    setMessages((prev) => {
      const uIdx = prev.findIndex((m) => m.id === retryableId);
      return prev.map((m, i) => (i === uIdx + 1 && m.role === "assistant" ? { ...m, parts: [] } : m));
    });
    kicked.current = retryableId;
    void sendMessage(undefined, { body: { pendingMessageId: retryableId } });
  }, [retryableId, hasActive, clearError, setMessages, sendMessage]);

  /* ---------- 发送 ---------- */
  const busy = hasActive || cancelling;
  const handleSubmit = useCallback(
    async ({ text }: { text: string }) => {
      const t = text.trim();
      if (!t || busy) return;
      setInput("");
      clearError();
      await sendMessage({ text: t });
    },
    [busy, clearError, sendMessage],
  );

  const currentReport = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const r = splitParts(m).report;
      if (r) return r;
    }
    return view.currentReport;
  }, [messages, view.currentReport]);

  const promptStatus = cancelling ? "cancelling" : hasActive && status === "ready" ? "streaming" : status;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-h-[calc(100dvh-8.5rem)] min-w-0 flex-col gap-3" aria-label="对话">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight">{view.conversation.title ?? "Agent 分析"}</h1>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {cancelling ? "正在停止…" : hasActive ? (poll.polling ? "正在同步进度…" : "分析进行中") : view.conversation.currentSymbol ? `当前 ${view.conversation.currentSymbol}` : ""}
          </span>
        </header>

        <Conversation className="min-h-0 flex-1 rounded-xl border border-border bg-background/40">
          <ConversationContent className="gap-5 p-3 sm:p-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} message={m} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  message={m}
                  pricePrecision={pricePrecision}
                  isLive={hasActive && m.id === lastAssistantId}
                  onRetry={retryableId && !hasActive ? handleRetry : undefined}
                />
              ),
            )}
            {error && !(error instanceof ConflictError) && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="flex-1">{errorMessage(error, "请求失败")}</span>
                {retryableId && (
                  <Button size="xs" variant="ghost" onClick={handleRetry} className="gap-1">
                    <RotateCcwIcon aria-hidden /> 重试
                  </Button>
                )}
              </div>
            )}
            {poll.error && <p className="text-xs text-destructive">{poll.error}</p>}
          </ConversationContent>
          <ConversationScrollButton aria-label="回到底部" />
        </Conversation>

        <div className="flex flex-col gap-2">
          {!hasActive && currentReport && (
            <Suggestions>
              {FOLLOWUPS.map((s) => (
                <Suggestion key={s} suggestion={s} onClick={setInput} className="text-xs" />
              ))}
            </Suggestions>
          )}
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "分析进行中，完成后可以继续追问…" : "继续追问，或输入新的分析请求…"}
                disabled={cancelling}
                aria-label="消息输入框"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="px-1.5 text-[11px] text-muted-foreground">Enter 发送 · Shift+Enter 换行</span>
              </PromptInputTools>
              <PromptInputSubmit status={promptStatus} onStop={handleStop} disabled={!busy && input.trim().length === 0} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </section>

      <ContextPanel conversation={view.conversation} report={currentReport} pricePrecision={pricePrecision} className="lg:sticky lg:top-4 lg:self-start" />
    </div>
  );
}

function liveRunId(messages: AgentUIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const run = splitParts(m).run;
    if (run) return run.runId;
    if (m.metadata?.runId) return m.metadata.runId;
  }
  return null;
}
