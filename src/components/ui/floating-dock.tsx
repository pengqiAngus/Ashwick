"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PanelBottomIcon } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

export type FloatingDockItem = {
  title: string;
  icon: React.ReactNode;
  href: string;
  active?: boolean;
};

export function FloatingDock({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: FloatingDockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
}

function FloatingDockMobile({ items, className }: { items: FloatingDockItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="navigation" aria-label="主导航" className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10, transition: { delay: idx * 0.05 } }}
                transition={{ delay: (items.length - 1 - idx) * 0.05 }}
              >
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  aria-label={item.title}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    item.active && "text-foreground ring-2 ring-primary",
                  )}
                >
                  <span className="flex size-4 items-center justify-center [&_svg]:size-full">{item.icon}</span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label={open ? "收起导航" : "打开导航"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-full bg-popover text-muted-foreground outline-none ring-1 ring-border focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <PanelBottomIcon className="size-5" />
      </button>
    </div>
  );
}

function FloatingDockDesktop({ items, className }: { items: FloatingDockItem[]; className?: string }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      role="navigation"
      aria-label="主导航"
      onMouseMove={(event) => mouseX.set(event.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "hidden h-16 items-end gap-3 rounded-2xl bg-popover px-3 pb-2.5 ring-1 ring-border md:flex",
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer key={item.title} mouseX={mouseX} {...item} />
      ))}
    </motion.div>
  );
}

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  active,
}: {
  mouseX: MotionValue;
  title: string;
  icon: React.ReactNode;
  href: string;
  active?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return value - bounds.x - bounds.width / 2;
  });
  const width = useSpring(useTransform(distance, [-150, 0, 150], [40, 80, 40]), {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const height = useSpring(useTransform(distance, [-150, 0, 150], [40, 80, 40]), {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const widthIcon = useSpring(useTransform(distance, [-150, 0, 150], [20, 40, 20]), {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const heightIcon = useSpring(useTransform(distance, [-150, 0, 150], [20, 40, 20]), {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={href} aria-label={title} aria-current={active ? "page" : undefined} className="outline-none">
      <motion.div
        ref={ref}
        style={{ width, height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-full bg-muted text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50",
          active && "text-foreground ring-2 ring-primary",
        )}
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 2, x: "-50%" }}
              className="absolute -top-8 left-1/2 w-fit rounded-md border border-border bg-popover px-2 py-0.5 text-xs whitespace-pre text-popover-foreground"
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div style={{ width: widthIcon, height: heightIcon }} className="flex items-center justify-center [&_svg]:size-full">
          {icon}
        </motion.div>
      </motion.div>
    </Link>
  );
}
