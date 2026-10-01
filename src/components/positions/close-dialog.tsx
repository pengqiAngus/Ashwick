"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { Decimal, parsePositiveDecimal, toPlainString } from "@/lib/decimal";
import { quoteQty, type CloseUnit } from "@/lib/position-math";
import { cn } from "@/lib/utils";
import type { PositionDto } from "@/lib/types";

export function CloseDialog({
  position,
  lastPrice,
  onClosed,
}: {
  position: PositionDto;
  lastPrice: string | null;
  onClosed: () => void;
}) {
  const amountId = useId();
  const priceId = useId();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<CloseUnit>("usdt");
  const [amount, setAmount] = useState("");
  const [closePrice, setClosePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setUnit("usdt");
    setAmount("");
    setClosePrice(lastPrice ?? "");
    setError(null);
    // 只在打开时带入当前价。行情刷新不能清掉正在填写的数量。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const maxText = useMemo(() => {
    const base = new Decimal(position.baseQty);
    if (unit === "base") return toPlainString(base);
    const px = parsePositiveDecimal(closePrice);
    if (!px.ok) return null;
    return toPlainString(quoteQty(base, px.value));
  }, [position.baseQty, unit, closePrice]);

  const slider = useMemo(() => {
    if (!maxText || amount.trim() === "") return 0;
    const parsed = parsePositiveDecimal(amount);
    const max = parsePositiveDecimal(maxText);
    if (!parsed.ok || !max.ok || max.value.lte(0)) return 0;
    return Math.min(1000, Math.round(parsed.value.div(max.value).mul(1000).toNumber()));
  }, [amount, maxText]);

  const setFromSlider = (step: number) => {
    setError(null);
    if (!maxText) return;
    if (step <= 0) {
      setAmount("");
      return;
    }
    if (step >= 1000) {
      setAmount(maxText);
      return;
    }
    setAmount(toPlainString(new Decimal(maxText).mul(step).div(1000)));
  };

  const submit = () => {
    if (saving) return;
    setError(null);
    startSaving(async () => {
      try {
        await apiFetch(`/api/positions/${encodeURIComponent(position.id)}/close`, {
          method: "POST",
          body: JSON.stringify({ amount: amount.trim(), unit, closePrice: closePrice.trim() }),
        });
        toast.success(`已平仓 ${position.symbol}`);
        setOpen(false);
        onClosed();
      } catch (err) {
        const msg = errorMessage(err, "平仓失败");
        setError(msg);
        toast.error(msg);
      }
    });
  };

  const unitLabel = unit === "usdt" ? "USDT" : position.baseAsset;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" aria-label={`平仓 ${position.symbol}`} />}>
        <LogOutIcon aria-hidden />
        平仓
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>平仓 {position.baseAsset}</DialogTitle>
          <DialogDescription>选择平仓数量和平仓价格。数量可以按 USDT 或 {position.baseAsset} 填写。</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-1 rounded-lg bg-background/50 p-1 ring-1 ring-foreground/6">
            {(["usdt", "base"] as const).map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => {
                  setUnit(next);
                  setAmount("");
                }}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs",
                  unit === next ? "bg-card text-foreground shadow-panel" : "text-muted-foreground",
                )}
              >
                {next === "usdt" ? "USDT" : position.baseAsset}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={amountId}>
            <span className="flex items-center justify-between">
              平仓数量（{unitLabel}）
              <button
                type="button"
                className="text-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  if (!maxText) return;
                  setAmount(maxText);
                  setError(null);
                }}
              >
                Max
              </button>
            </span>
            <Input
              id={amountId}
              inputMode="decimal"
              autoComplete="off"
              placeholder={maxText ? `最多 ${maxText}` : "先填写平仓价格"}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className="tabular h-9 bg-card"
            />
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={slider}
              disabled={maxText == null}
              aria-label="平仓数量比例"
              onChange={(e) => setFromSlider(Number(e.target.value))}
              className="mt-1 h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={priceId}>
            平仓价格（USDT）
            <Input
              id={priceId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="例如 60000"
              value={closePrice}
              onChange={(e) => {
                setClosePrice(e.target.value);
                setError(null);
              }}
              className="tabular h-9 bg-card"
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
              {saving ? "提交中" : "确认平仓"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
