"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, LogInIcon } from "lucide-react";
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
import { isLeverage, LEVERAGE_MAX, LEVERAGE_MIN } from "@/lib/position-math";
import { cn } from "@/lib/utils";
import type { PositionSide } from "@/lib/types";

const SIDE_LABEL: Record<PositionSide, string> = { long: "开多", short: "开空" };

export function EntryDialog({
  symbol,
  title,
  baseAsset,
  side,
  lastPrice,
  buttonVariant = "ghost",
  buttonSize = "sm",
}: {
  symbol: string;
  title: string;
  baseAsset: string;
  side: PositionSide | null;
  lastPrice: string | null;
  buttonVariant?: "ghost" | "outline";
  buttonSize?: "sm" | "default";
}) {
  const qtyId = useId();
  const priceId = useId();
  const levId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosenSide, setChosenSide] = useState<PositionSide>(side ?? "long");
  const [baseQty, setBaseQty] = useState("");
  const [leverageText, setLeverageText] = useState("10");
  const [entryPrice, setEntryPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setChosenSide(side ?? "long");
    setBaseQty("");
    setLeverageText("10");
    setEntryPrice("");
    setError(null);
    // 只在打开时重置。行情刷新不能清掉正在填写的表单。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsedLev = Number.parseInt(leverageText, 10);
  const sliderLev = Number.isInteger(parsedLev) ? Math.min(LEVERAGE_MAX, Math.max(LEVERAGE_MIN, parsedLev)) : LEVERAGE_MIN;

  const submit = () => {
    if (saving) return;
    if (!isLeverage(parsedLev)) {
      setError(`杠杆必须是 ${LEVERAGE_MIN} 到 ${LEVERAGE_MAX} 的整数`);
      return;
    }
    setError(null);
    startSaving(async () => {
      try {
        await apiFetch("/api/positions", {
          method: "POST",
          body: JSON.stringify({ symbol, side: chosenSide, baseQty: baseQty.trim(), leverage: parsedLev, entryPrice: entryPrice.trim() }),
        });
        setOpen(false);
        router.push("/positions");
      } catch (err) {
        const msg = errorMessage(err, "开仓失败");
        setError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={buttonVariant}
            size={buttonSize}
            className="gap-1.5"
            aria-label={`为 ${symbol} 开仓`}
          />
        }
      >
        <LogInIcon aria-hidden />
        开仓
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>{title} 开仓</DialogTitle>
          <DialogDescription>
            选择方向，填写开仓数量、杠杆和开仓价。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-1 rounded-lg bg-background/50 p-1 ring-1 ring-foreground/6" role="group" aria-label="方向">
            {(["long", "short"] as const).map((next) => (
              <button
                key={next}
                type="button"
                aria-pressed={chosenSide === next}
                onClick={() => setChosenSide(next)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs",
                  chosenSide === next ? "bg-card shadow-panel" : "text-muted-foreground",
                  chosenSide === next && (next === "long" ? "text-up" : "text-down"),
                )}
              >
                {SIDE_LABEL[next]}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={qtyId}>
            开仓数量（{baseAsset}）
            <Input
              id={qtyId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="例如 0.01"
              value={baseQty}
              onChange={(e) => {
                setBaseQty(e.target.value);
                setError(null);
              }}
              className="tabular h-9 bg-card"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={levId}>
            <span className="flex items-center justify-between">
              杠杆
              <button
                type="button"
                className="text-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setLeverageText(String(LEVERAGE_MAX));
                  setError(null);
                }}
              >
                Max
              </button>
            </span>
            <Input
              id={levId}
              inputMode="numeric"
              autoComplete="off"
              placeholder={`${LEVERAGE_MIN}–${LEVERAGE_MAX}`}
              value={leverageText}
              onChange={(e) => {
                setLeverageText(e.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              onBlur={() => {
                if (!isLeverage(parsedLev)) setLeverageText(String(sliderLev));
              }}
              className="tabular h-9 bg-card"
            />
            <input
              type="range"
              min={LEVERAGE_MIN}
              max={LEVERAGE_MAX}
              step={1}
              value={sliderLev}
              aria-label="杠杆滑杆"
              onChange={(e) => {
                setLeverageText(e.target.value);
                setError(null);
              }}
              className="h-2 w-full cursor-pointer accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={priceId}>
            开仓价格（USDT）
            <Input
              id={priceId}
              inputMode="decimal"
              autoComplete="off"
              placeholder={lastPrice ?? "例如 60000"}
              value={entryPrice}
              onChange={(e) => {
                setEntryPrice(e.target.value);
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
              {saving ? "提交中" : "开仓"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
