"use client";

import { LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { KLINE_INTERVALS, type KlineInterval } from "@/lib/types";

const LABELS: Record<KlineInterval, string> = { "15m": "15分", "1h": "1时", "4h": "4时", "1d": "1天", "1w": "1周" };

export function IntervalTabs({ value, onChange }: { value: KlineInterval; onChange: (v: KlineInterval) => void }) {
  return (
    <LayoutGroup id="interval-tabs">
      <div role="tablist" aria-label="K 线周期" className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
        {KLINE_INTERVALS.map((iv) => {
          const active = iv === value;
          return (
            <button
              key={iv}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(iv)}
              className={cn(
                "relative h-8 min-w-12 rounded-md px-3 text-sm outline-none transition-colors duration-(--dur-fast)",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="interval-active"
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-muted"
                  transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                />
              )}
              <span className="relative">
                {LABELS[iv]}
                <span className="sr-only">（{iv}）</span>
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
