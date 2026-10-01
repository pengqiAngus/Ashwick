"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { StarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  symbol,
  initialFavorite,
  onChange,
  size = "default",
}: {
  symbol: string;
  initialFavorite: boolean;
  onChange?: (favorite: boolean) => void;
  size?: "default" | "sm";
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !favorite;
    startTransition(async () => {
      try {
        if (next) {
          await apiFetch(`/api/favorites`, { method: "POST", body: JSON.stringify({ symbol }) });
        } else {
          await apiFetch(`/api/favorites/${encodeURIComponent(symbol)}`, { method: "DELETE" });
        }
        setFavorite(next);
        onChange?.(next);
        toast.success(next ? `已收藏 ${symbol}` : `已取消收藏 ${symbol}`);
      } catch (err) {
        // 失败时保持真实状态（不做乐观更新），仅提示
        toast.error(errorMessage(err, next ? "收藏失败" : "取消收藏失败"));
      }
    });
  };

  return (
    <Button
      type="button"
      variant={favorite ? "secondary" : "outline"}
      size={size}
      aria-pressed={favorite}
      disabled={pending}
      onClick={toggle}
      className={cn("gap-1.5 transition-colors", favorite && "text-primary")}
    >
      <motion.span
        key={String(favorite)}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.35, duration: 0.35 }}
        className="inline-flex"
      >
        <StarIcon className={cn("size-4", favorite && "fill-current")} aria-hidden />
      </motion.span>
      {favorite ? "已收藏" : "收藏"}
    </Button>
  );
}
