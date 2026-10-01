"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BotIcon, ChartCandlestickIcon, HouseIcon, ScrollTextIcon, StarIcon, WalletIcon } from "lucide-react";
import { ThemeMenu } from "@/components/theme-menu";
import { FloatingDock, type FloatingDockItem } from "@/components/ui/floating-dock";
import { DEFAULT_SYMBOL, readStoredChartSymbol } from "@/lib/types";

const NAV = [
  { title: "Home", href: "/", icon: HouseIcon, match: (path: string) => path === "/" },
  { title: "K线", href: `/chart?symbol=${DEFAULT_SYMBOL}`, icon: ChartCandlestickIcon, match: (path: string) => path.startsWith("/chart") },
  { title: "Favorite", href: "/favorites", icon: StarIcon, match: (path: string) => path.startsWith("/favorites") },
  { title: "仓位", href: "/positions", icon: WalletIcon, match: (path: string) => path.startsWith("/positions") },
  { title: "记录", href: "/records", icon: ScrollTextIcon, match: (path: string) => path.startsWith("/records") },
  { title: "Agent", href: "/agent", icon: BotIcon, match: (path: string) => path.startsWith("/agent") },
] as const;

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [chartSymbol, setChartSymbol] = useState(DEFAULT_SYMBOL);

  useEffect(() => {
    const sync = () => setChartSymbol(readStoredChartSymbol());
    sync();
    window.addEventListener("chart-symbol", sync);
    return () => window.removeEventListener("chart-symbol", sync);
  }, []);

  const items: FloatingDockItem[] = NAV.map((item) => ({
    title: item.title,
    href: item.title === "K线" ? `/chart?symbol=${encodeURIComponent(chartSymbol)}` : item.href,
    active: item.match(pathname),
    icon: <item.icon />,
  }));

  return (
    <>
      <div className="pointer-events-none fixed top-4 right-4 z-40">
        <div className="pointer-events-auto rounded-full bg-popover ring-1 ring-border">
          <ThemeMenu />
        </div>
      </div>
      <header className="pointer-events-none fixed bottom-4 z-40 max-md:right-4 md:inset-x-0 md:flex md:justify-center md:px-4">
        <div className="pointer-events-auto">
          <FloatingDock items={items} />
        </div>
      </header>
    </>
  );
}
