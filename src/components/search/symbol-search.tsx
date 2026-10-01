"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeftIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSymbolSearch } from "@/hooks/use-symbol-search";
import { cn } from "@/lib/utils";
import { changeDirection, formatPair, formatPercent, formatPrice } from "@/lib/format";
import type { SearchHit } from "@/lib/types";

function Quote({ item }: { item: SearchHit }) {
  const dir = changeDirection(item.priceChangePercent);
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      <span className="text-sm font-medium tabular text-foreground">
        <span className="sr-only">最新价 </span>
        {formatPrice(item.lastPrice, item.pricePrecision)}
      </span>
      <span
        className={cn(
          "text-xs tabular",
          dir === "up" && "text-up",
          dir === "down" && "text-down",
          dir === "flat" && "text-muted-foreground",
        )}
      >
        <span className="sr-only">24 小时 </span>
        {formatPercent(item.priceChangePercent)}
      </span>
    </span>
  );
}

export function SymbolSearch({
  variant = "hero",
  placeholder = "搜索币种，例如 BTC、ETH、SOL",
  className,
}: {
  /** hero：首页大搜索框；compact：K 线页顶部的紧凑搜索框 */
  variant?: "hero" | "compact";
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const compact = variant === "compact";
  const listId = useId();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = input.trim().length > 0;
  const search = useSymbolSearch(input, open && !hasQuery);

  const showPanel = open && (hasQuery ? search.status !== "idle" : true);

  // 结果变化时重置高亮项
  useEffect(() => {
    setActiveIndex(search.results.length ? 0 : -1);
  }, [search.results]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const go = (item: SearchHit) => {
    setOpen(false);
    if (compact) {
      setInput("");
      inputRef.current?.blur();
    }
    router.push(`/chart?symbol=${encodeURIComponent(item.symbol)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (showPanel) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!showPanel) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const n = search.results.length;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + n) % n);
    } else if (e.key === "Enter" && n && activeIndex >= 0) {
      e.preventDefault();
      go(search.results[activeIndex]);
    }
  };

  const activeId = activeIndex >= 0 && search.results[activeIndex] ? `${listId}-${search.results[activeIndex].symbol}` : undefined;

  return (
    <div ref={rootRef} className={cn("relative w-full sm:w-[560px]", className)}>
      {/* 静态柔和光晕：焦点时略增强（仅首页） */}
      {!compact && (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-x-16 -inset-y-20 -z-10 rounded-full blur-3xl transition-opacity duration-(--dur) ease-(--ease)",
          "bg-[radial-gradient(closest-side,var(--color-primary-soft),transparent)]",
          open ? "opacity-80" : "opacity-45",
        )}
      />
      )}

      <div
        className={cn(
          "group relative flex items-center border bg-card",
          "transition-[border-color,box-shadow] duration-(--dur) ease-(--ease)",
          "border-border hover:border-foreground/15 focus-within:border-primary/60",
          compact
            ? "h-9 gap-2 rounded-lg px-2.5 focus-within:ring-3 focus-within:ring-ring/30"
            : "h-14 gap-3 rounded-2xl px-4 shadow-(--shadow-panel) focus-within:shadow-(--shadow-glow)",
        )}
      >
        <SearchIcon
          aria-hidden
          className={cn("shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary", compact ? "size-4" : "size-5")}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="搜索币种"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-foreground uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground/80",
            compact ? "text-sm" : "text-base",
          )}
        />
        {search.status === "loading" && (
          <Loader2Icon aria-label="搜索中" className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            key="panel"
            role="presentation"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className={cn(
              "absolute inset-x-0 top-full z-30 overflow-hidden border border-border bg-popover shadow-(--shadow-panel)",
              compact ? "mt-1.5 rounded-xl" : "mt-2 rounded-2xl",
            )}
          >
            {search.results.length === 0 && search.status !== "error" && search.status !== "empty" && (
              <div role="status" aria-label="加载中" className="flex flex-col gap-2 px-4 py-3">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            )}
            {hasQuery && search.status === "empty" && (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                没有匹配 <span className="font-medium text-foreground">{search.query}</span> 的 USDT 现货交易对
              </p>
            )}
            {search.status === "error" && (
              <p role="alert" className="px-4 py-3 text-sm text-destructive">
                {search.errorText ?? "搜索失败，请稍后重试"}
              </p>
            )}
            {search.results.length > 0 && (
              <>
                {!hasQuery && <p className="px-4 pt-2.5 pb-0.5 text-xs text-muted-foreground">热门</p>}
                <ul id={listId} role="listbox" aria-label={hasQuery ? "搜索结果" : "热门市场"} className="max-h-[min(60vh,420px)] overflow-y-auto py-1.5">
                {search.results.map((item, index) => {
                  const active = index === activeIndex;
                  return (
                    <li
                      key={item.symbol}
                      id={`${listId}-${item.symbol}`}
                      role="option"
                      aria-selected={active}
                      onPointerMove={() => activeIndex !== index && setActiveIndex(index)}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => go(item)}
                      className={cn(
                        "mx-1.5 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-(--dur-fast)",
                        active ? "bg-muted" : "bg-transparent",
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tracking-wide text-foreground/90 ring-1 ring-foreground/10"
                      >
                        {item.baseAsset.slice(0, 2)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium text-foreground">{item.baseAsset}</span>
                        <span className="truncate text-xs text-muted-foreground">{formatPair(item.baseAsset, item.quoteAsset)}</span>
                      </span>
                      <Quote item={item} />
                      <CornerDownLeftIcon
                        aria-hidden
                        className={cn(
                          "size-3.5 shrink-0 text-muted-foreground transition-opacity duration-(--dur-fast)",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </li>
                  );
                })}
                </ul>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
