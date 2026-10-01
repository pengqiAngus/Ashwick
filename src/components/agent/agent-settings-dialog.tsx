"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, errorMessage } from "@/lib/client-api";

type RiskMode = "fast" | "deep";

type AgentSettingsView = {
  providerName: string;
  providerBaseUrl: string;
  apiKeySet: boolean;
  apiKeyHint: string;
  modelAnalyst: string;
  modelSynth: string;
  supportsStructuredOutputs: boolean;
  maxRunMs: number;
  maxModelCalls: number;
  debateRounds: number;
  maxInputChars: number;
  riskMode: RiskMode;
  overridden: boolean;
};

const RISK_ITEMS: { label: string; value: RiskMode }[] = [
  { value: "fast", label: "fast · 单个风险节点" },
  { value: "deep", label: "deep · 三角色再汇总" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function AgentSettingsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AgentSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setView(null);
    setApiKey("");
    setError(null);
    apiFetch<AgentSettingsView>("/api/agent/settings")
      .then((res) => {
        if (!cancelled) setView(res);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "加载设置失败"));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function patch(partial: Partial<AgentSettingsView>) {
    setView((current) => (current ? { ...current, ...partial } : current));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!view || busy) return;
    setBusy(true);
    try {
      const saved = await apiFetch<AgentSettingsView>("/api/agent/settings", {
        method: "PUT",
        body: JSON.stringify({
          providerName: view.providerName,
          providerBaseUrl: view.providerBaseUrl,
          apiKey: apiKey.trim() || undefined,
          modelAnalyst: view.modelAnalyst,
          modelSynth: view.modelSynth,
          supportsStructuredOutputs: view.supportsStructuredOutputs,
          maxRunMs: view.maxRunMs,
          maxModelCalls: view.maxModelCalls,
          debateRounds: view.debateRounds,
          maxInputChars: view.maxInputChars,
          riskMode: view.riskMode,
        }),
      });
      setView(saved);
      setApiKey("");
      toast.success("已保存，之后的分析使用这组配置");
      router.refresh();
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "保存失败"));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await apiFetch<AgentSettingsView>("/api/agent/settings", { method: "DELETE" });
      setView(next);
      setApiKey("");
      toast.success("已恢复为环境变量");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "恢复失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" aria-label="Agent 设置" />}>
        <SettingsIcon aria-hidden />
        设置
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(40rem,calc(100vh-2rem))] max-w-[calc(100%-2rem)] flex-col sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Agent 设置</DialogTitle>
          <DialogDescription>保存后以这里为准。留空的地址和模型名会回退到环境变量；密钥留空表示不修改。若环境变量设置了 AI_STRUCTURED_OUTPUT_MODE，结构化输出仍以该模式为准。</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : view == null ? (
          <div role="status" aria-label="加载中" className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={save}>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              <p className="text-xs font-medium text-foreground">模型服务</p>
              <Field label="服务名称">
                <Input value={view.providerName} onChange={(e) => patch({ providerName: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="服务地址">
                <Input value={view.providerBaseUrl} onChange={(e) => patch({ providerBaseUrl: e.target.value })} placeholder="https://" autoComplete="off" />
              </Field>
              <Field label="API Key">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={view.apiKeySet ? `已设置（****${view.apiKeyHint}），留空不修改` : "留空则使用环境变量"}
                  autoComplete="off"
                />
              </Field>
              <Field label="分析模型">
                <Input value={view.modelAnalyst} onChange={(e) => patch({ modelAnalyst: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="汇总模型">
                <Input value={view.modelSynth} onChange={(e) => patch({ modelSynth: e.target.value })} autoComplete="off" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={view.supportsStructuredOutputs}
                  onChange={(e) => patch({ supportsStructuredOutputs: e.target.checked })}
                />
                支持 json_schema 结构化输出
              </label>

              <p className="pt-1 text-xs font-medium text-foreground">运行参数</p>
              <Field label="单次运行时限（毫秒，不少于 30000）">
                <Input type="number" min={30_000} value={view.maxRunMs} onChange={(e) => patch({ maxRunMs: Number(e.target.value) })} />
              </Field>
              <Field label="模型调用次数上限">
                <Input type="number" min={1} value={view.maxModelCalls} onChange={(e) => patch({ maxModelCalls: Number(e.target.value) })} />
              </Field>
              <Field label="多空辩论轮数">
                <Input type="number" min={1} value={view.debateRounds} onChange={(e) => patch({ debateRounds: Number(e.target.value) })} />
              </Field>
              <Field label="单条消息字数上限">
                <Input type="number" min={200} value={view.maxInputChars} onChange={(e) => patch({ maxInputChars: Number(e.target.value) })} />
              </Field>
              <Field label="风险模式">
                <Select items={RISK_ITEMS} value={view.riskMode} onValueChange={(next) => { if (next === "fast" || next === "deep") patch({ riskMode: next }); }}>
                  <SelectTrigger className="w-full" aria-label="风险模式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {RISK_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <Button type="button" variant="outline" disabled={busy || !view.overridden} onClick={reset}>
                恢复环境变量
              </Button>
              <Button type="submit" disabled={busy}>
                保存
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
