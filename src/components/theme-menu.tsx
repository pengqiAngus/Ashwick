"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, PaletteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers";
import { THEMES, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: ThemeId) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="主题"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <PaletteIcon />
      </Button>
      {open && (
        <ul
          role="menu"
          aria-label="主题"
          className="absolute right-0 top-full z-50 mt-1 min-w-28 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-panel"
        >
          {THEMES.map((item) => {
            const active = item.id === theme;
            return (
              <li key={item.id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => choose(item.id)}
                >
                  {item.label}
                  {active && <CheckIcon className="size-3.5" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
