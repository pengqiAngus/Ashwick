"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CandlestickChartIcon, CheckIcon, Loader2Icon, SparklesIcon, StarOffIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ActivityDialog } from "@/components/favorites/activity-dialog";
import { EntryDialog } from "@/components/favorites/entry-dialog";
import { NoteDialog } from "@/components/favorites/note-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChangeText, PriceText } from "@/components/price/price-text";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { publicEnv } from "@/lib/env";
import { formatPair, formatPrice, formatRelativeTime } from "@/lib/format";
import { evaluateTarget, type TargetStatus } from "@/lib/target-range";
import { validateTargetRange } from "@/lib/target-range-validate";
import { cn } from "@/lib/utils";
import type { FavoriteDto, PositionSide, SymbolInfo, Ticker } from "@/lib/types";
import type { CreateConversationResponse } from "@/lib/agent/schemas";

interface Range {
  low: string | null;
  high: string | null;
}

const SIDE_ITEMS: { label: string; value: PositionSide }[] = [
  { label: "开多", value: "long" },
  { label: "开空", value: "short" },
];

const SIDE_LABEL: Record<PositionSide, string> = {
  long: "开多",
  short: "开空",
};

function noteSnippet(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STATUS_TEXT: Record<TargetStatus, string> = {
  none: "未设置目标区间",
  in_range: "已进入目标区间",
  out_of_range: "未进入目标区间",
  stale: "行情已过期，暂不判断",
  unavailable: "暂无行情，暂不判断",
};

export function FavoriteCard({
  favorite,
  info,
  ticker,
  quoteUpdatedAt,
  quoteError,
  now,
  onRemoved,
}: {
  favorite: FavoriteDto;
  info: SymbolInfo | null;
  ticker: Ticker | null;
  quoteUpdatedAt: number | null;
  quoteError: string | null;
  now: number;
  onRemoved: (symbol: string) => void;
}) {
  const ids = { low: useId(), high: useId(), err: useId() };
  const precision = info?.pricePrecision ?? 2;

  /** 最后一次成功保存的区间：命中判断只依据它 */
  const [savedRange, setSavedRange] = useState<Range>({ low: favorite.targetLow, high: favorite.targetHigh });
  const [draft, setDraft] = useState<Range>({ low: favorite.targetLow ?? "", high: favorite.targetHigh ?? "" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [side, setSide] = useState<PositionSide | null>(favorite.side ?? null);
  const [savedNote, setSavedNote] = useState(favorite.note ?? "");
  const [saving, startSaving] = useTransition();
  const [savingSide, startSavingSide] = useTransition();
  const [removing, startRemoving] = useTransition();
  const [launching, startLaunching] = useTransition();
  const router = useRouter();
  /** 本次点击的幂等键：网络重试复用，成功跳转后重置 */
  const launchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!savedFlash) return;
    const id = window.setTimeout(() => setSavedFlash(false), 1800);
    return () => window.clearTimeout(id);
  }, [savedFlash]);

  const age = quoteUpdatedAt == null ? null : now - quoteUpdatedAt;
  const status = evaluateTarget({
    targetLow: savedRange.low,
    targetHigh: savedRange.high,
    lastPrice: ticker?.lastPrice ?? null,
    quoteAgeMs: age,
    staleMs: publicEnv.quoteStaleMs,
  });
  const hit = status === "in_range";
  const stale = age != null && age > publicEnv.quoteStaleMs;
  const dirty = (draft.low ?? "") !== (savedRange.low ?? "") || (draft.high ?? "") !== (savedRange.high ?? "");
  const notePreview = noteSnippet(savedNote);

  const save = () => {
    const v = validateTargetRange({ low: draft.low, high: draft.high });
    if (!v.ok) {
      setFieldError(v.message);
      return;
    }
    setFieldError(null);
    startSaving(async () => {
      try {
        const res = await apiFetch<{ favorite: FavoriteDto }>(`/api/favorites/${encodeURIComponent(favorite.symbol)}/target`, {
          method: "PUT",
          body: JSON.stringify({ low: v.low, high: v.high }),
        });
        const next = { low: res.favorite.targetLow, high: res.favorite.targetHigh };
        setSavedRange(next);
        setDraft({ low: next.low ?? "", high: next.high ?? "" });
        setSavedFlash(true);
        toast.success(next.low == null ? `已移除 ${favorite.symbol} 的目标区间` : `已保存 ${favorite.symbol} 的目标区间`);
      } catch (err) {
        const msg = errorMessage(err, "保存失败");
        setFieldError(msg);
        toast.error(msg);
      }
    });
  };

  const saveSide = (next: PositionSide) => {
    if (next === side || savingSide) return;
    const previous = side;
    setSide(next);
    startSavingSide(async () => {
      try {
        const res = await apiFetch<{ favorite: FavoriteDto }>(`/api/favorites/${encodeURIComponent(favorite.symbol)}/side`, {
          method: "PUT",
          body: JSON.stringify({ side: next }),
        });
        setSide(res.favorite.side);
        toast.success(`已将 ${favorite.symbol} 设为${res.favorite.side ? SIDE_LABEL[res.favorite.side] : "未选择"}`);
      } catch (err) {
        setSide(previous);
        toast.error(errorMessage(err, "保存方向失败"));
      }
    });
  };

  const saveNote = async (note: string) => {
    try {
      const res = await apiFetch<{ favorite: FavoriteDto }>(`/api/favorites/${encodeURIComponent(favorite.symbol)}/note`, {
        method: "PUT",
        body: JSON.stringify({ note: note || null }),
      });
      const next = res.favorite.note ?? "";
      setSavedNote(next);
      toast.success(next ? `已保存 ${favorite.symbol} 的备注` : `已清空 ${favorite.symbol} 的备注`);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "保存备注失败"));
      return false;
    }
  };

  const remove = () => {
    startRemoving(async () => {
      try {
        await apiFetch(`/api/favorites/${encodeURIComponent(favorite.symbol)}`, { method: "DELETE" });
        toast.success(`已取消收藏 ${favorite.symbol}`);
        onRemoved(favorite.symbol);
      } catch (err) {
        toast.error(errorMessage(err, "取消收藏失败"));
      }
    });
  };

  const chartHref = `/chart?symbol=${encodeURIComponent(favorite.symbol)}`;

  /**
   * AI 分析：服务端按数据库中“已保存”的目标区间生成首条消息（不传输入框草稿），
   * 创建会话后跳转，由会话页只启动一次分析。
   */
  const launchAgent = () => {
    if (launching) return;
    launchIdRef.current ??= crypto.randomUUID();
    startLaunching(async () => {
      try {
        const res = await apiFetch<CreateConversationResponse>("/api/agent/conversations", {
          method: "POST",
          body: JSON.stringify({ source: "favorite_card", symbol: favorite.symbol, launchId: launchIdRef.current }),
        });
        launchIdRef.current = null;
        router.push(`/agent/${encodeURIComponent(res.conversationId)}`);
      } catch (err) {
        toast.error(errorMessage(err, "创建分析会话失败"));
      }
    });
  };

  return (
    <article
      data-hit={hit || undefined}
      aria-label={`${favorite.symbol} 收藏卡片`}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-(--shadow-panel)",
        "transition-[border-color,background-color,box-shadow] duration-(--dur) ease-(--ease)",
        hit ? "border-hit/60 bg-[color-mix(in_oklch,var(--card),var(--hit)_7%)] shadow-[0_0_0_1px_var(--primary-ring)]" : "border-border",
      )}
    >
      {/* 标题行 */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={chartHref}
            className="rounded-sm text-base font-semibold tracking-tight outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {formatPair(favorite.baseAsset, favorite.quoteAsset)}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">{favorite.symbol}</p>
        </div>
        <AnimatePresence initial={false}>
          {hit && (
            <motion.div
              key="hit"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <Badge className="gap-1 bg-hit/15 text-hit">
                <TargetIcon aria-hidden />
                已进入目标区间
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 行情 */}
      <div className="flex flex-col gap-1">
        {ticker ? (
          <PriceText value={ticker.lastPrice} precision={precision} className="text-2xl font-semibold tracking-tight" />
        ) : (
          <span className="text-2xl font-semibold text-muted-foreground">—</span>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">24 小时涨跌</span>
            {ticker ? (
              <ChangeText change={ticker.priceChange} changePercent={ticker.priceChangePercent} precision={precision} className="text-sm font-medium" />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        </div>
        <div className="min-h-4 text-xs text-muted-foreground">
          {age != null ? (
            <>
              更新于 {formatRelativeTime(age)}
              {stale && <span className="ml-2 text-destructive">行情已过期</span>}
            </>
          ) : quoteError ? (
            <span className="text-destructive">{quoteError}</span>
          ) : (
            <Skeleton className="inline-block h-3 w-16 align-middle" role="status" aria-label="加载中" />
          )}
          {info == null && <span className="ml-2 text-destructive">该交易对当前不可交易</span>}
        </div>
      </div>

      {/* 目标区间表单：不触发跳转 */}
      <form
        className="flex flex-col gap-2.5 rounded-lg bg-background/50 p-3 ring-1 ring-foreground/6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          方向
          <Select
            items={SIDE_ITEMS}
            value={side ?? null}
            onValueChange={(next) => {
              if (next === "long" || next === "short") saveSide(next);
            }}
          >
            <SelectTrigger
              size="sm"
              disabled={savingSide}
              aria-label={`${favorite.symbol} 开仓方向`}
              className={cn("w-full bg-card", side === "long" && "text-up", side === "short" && "text-down")}
            >
              <SelectValue placeholder="选择开多或开空" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {SIDE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value} className={item.value === "long" ? "text-up" : "text-down"}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">目标价格区间（USDT）</span>
          <span
            className={cn("text-xs", hit ? "text-hit" : status === "stale" || status === "unavailable" ? "text-destructive" : "text-muted-foreground")}
            aria-live="polite"
          >
            {STATUS_TEXT[status]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={ids.low}>
            下限
            <Input
              id={ids.low}
              inputMode="decimal"
              autoComplete="off"
              placeholder="例如 60000"
              value={draft.low ?? ""}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? ids.err : undefined}
              onChange={(e) => {
                setDraft((d) => ({ ...d, low: e.target.value }));
                setFieldError(null);
              }}
              className="tabular h-9 bg-card"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={ids.high}>
            上限
            <Input
              id={ids.high}
              inputMode="decimal"
              autoComplete="off"
              placeholder="例如 70000"
              value={draft.high ?? ""}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? ids.err : undefined}
              onChange={(e) => {
                setDraft((d) => ({ ...d, high: e.target.value }));
                setFieldError(null);
              }}
              className="tabular h-9 bg-card"
            />
          </label>
        </div>
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p id={ids.err} role={fieldError ? "alert" : undefined} className="min-w-0 text-xs">
            {fieldError ? (
              <span className="text-destructive">{fieldError}</span>
            ) : savedRange.low != null && savedRange.high != null ? (
              <span className="tabular text-muted-foreground">
                已保存 {formatPrice(savedRange.low, precision)} – {formatPrice(savedRange.high, precision)}
                {dirty && <span className="ml-1">（有未保存修改）</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">{dirty ? "尚未保存" : "两项都清空并保存可移除区间"}</span>
            )}
          </p>
          <Button type="submit" size="sm" disabled={saving} className="shrink-0 min-w-16">
            {saving ? <Loader2Icon className="animate-spin" aria-hidden /> : savedFlash ? <CheckIcon aria-hidden /> : null}
            {saving ? "保存中" : savedFlash ? "已保存" : "保存"}
          </Button>
        </div>
      </form>

      {notePreview ? <p className="line-clamp-2 text-xs text-muted-foreground">{notePreview}</p> : null}

      <footer className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={chartHref} />} className="gap-1.5">
            <CandlestickChartIcon aria-hidden />
            查看 K 线
          </Button>
          <NoteDialog symbol={favorite.symbol} title={formatPair(favorite.baseAsset, favorite.quoteAsset)} note={savedNote} onSave={saveNote} />
          <ActivityDialog
            symbol={favorite.symbol}
            title={formatPair(favorite.baseAsset, favorite.quoteAsset)}
            createdAt={favorite.createdAt}
          />
          <EntryDialog
            symbol={favorite.symbol}
            title={formatPair(favorite.baseAsset, favorite.quoteAsset)}
            baseAsset={favorite.baseAsset}
            side={side}
            lastPrice={ticker?.lastPrice ?? null}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={launching || info == null}
            onClick={launchAgent}
            className="gap-1.5 text-primary hover:text-primary"
            aria-label={`对 ${favorite.symbol} 进行 AI 分析`}
          >
            {launching ? <Loader2Icon className="animate-spin" aria-hidden /> : <SparklesIcon aria-hidden />}
            AI 分析
          </Button>
        </div>
        <Button variant="ghost" size="sm" disabled={removing} onClick={remove} className="gap-1.5 text-muted-foreground hover:text-destructive">
          {removing ? <Loader2Icon className="animate-spin" aria-hidden /> : <StarOffIcon aria-hidden />}
          取消收藏
        </Button>
      </footer>
    </article>
  );
}
