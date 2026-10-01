"use client";

import { useEffect, useState } from "react";
import { HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { splitActivitySummary, type ActivityTone } from "@/lib/activity-summary";
import { formatDateTime } from "@/lib/format";
import type { FavoriteEventDto } from "@/lib/types";

const TONE_CLASS: Record<ActivityTone, string> = {
  favorite: "text-sky-600 dark:text-sky-400",
  long: "text-up",
  short: "text-down",
  target: "text-amber-600 dark:text-amber-400",
};

function ActivitySummary({ summary }: { summary: string }) {
  return splitActivitySummary(summary).map((part, index) =>
    part.tone ? (
      <span key={index} className={TONE_CLASS[part.tone]}>
        {part.text}
      </span>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

export function ActivityDialog({ symbol, title, createdAt }: { symbol: string; title: string; createdAt: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<FavoriteEventDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEvents(null);
    setError(null);
    apiFetch<{ events: FavoriteEventDto[] }>(`/api/favorites/${encodeURIComponent(symbol)}/events`)
      .then((res) => {
        if (!cancelled) setEvents(res.events);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "加载操作记录失败"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, symbol]);

  const rows = events == null ? null : [...events, { id: "created", summary: "收藏", createdAt }];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5" />}>
        <HistoryIcon aria-hidden />
        操作记录
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(32rem,calc(100vh-2rem))] max-w-[calc(100%-2rem)] flex-col sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>{title} 操作记录</DialogTitle>
          <DialogDescription>每次保存方向、目标区间或备注都会记在这里。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : rows == null ? (
            <div role="status" aria-label="加载中" className="flex flex-col gap-3 py-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : (
            <ul>
              {rows.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 last:border-0">
                  <span>
                    <ActivitySummary summary={event.summary} />
                  </span>
                  <time dateTime={event.createdAt} className="shrink-0 text-xs tabular text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
