"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const SCENES = ["walk", "jump", "ring", "orbits", "swarm", "bounce"] as const;
type Scene = (typeof SCENES)[number];
type Orbit = { r: number; dur: number; size: number };

export function LoadingScene({ variant = "block", className }: { variant?: "block" | "page"; className?: string }) {
  const [pick, setPick] = useState<{ scene: Scene; orbits: Orbit[] } | null>(null);

  useEffect(() => {
    const count = 5 + Math.floor(Math.random() * 6);
    setPick({
      scene: SCENES[Math.floor(Math.random() * SCENES.length)]!,
      orbits: Array.from({ length: count }, (_, i) => ({
        r: 16 + i * 7,
        dur: 1.1 + Math.random() * 2.2,
        size: 4 + Math.random() * 5,
      })),
    });
  }, []);

  return (
    <div
      role="status"
      aria-label="加载中"
      className={cn("flex items-center justify-center", variant === "page" ? "min-h-[50vh] w-full" : "h-full min-h-32 w-full", className)}
    >
      {pick?.scene === "walk" && <Walker />}
      {pick?.scene === "jump" && <Jumper />}
      {pick?.scene === "ring" && <Ring />}
      {pick?.scene === "orbits" && <Orbits dots={pick.orbits} />}
      {pick?.scene === "swarm" && <Swarm />}
      {pick?.scene === "bounce" && <Bounce />}
    </div>
  );
}

function Stick({ legs }: { legs: React.ReactNode }) {
  return (
    <div className="relative h-24 w-14">
      <div className="absolute left-1/2 top-0 size-5 -translate-x-1/2 rounded-full bg-foreground" />
      <div className="absolute left-1/2 top-5 h-8 w-1 -translate-x-1/2 rounded-full bg-foreground" />
      <div className="absolute top-13 left-1/2">{legs}</div>
    </div>
  );
}

function Leg({ from, to }: { from: number; to: number }) {
  return (
    <motion.div
      className="absolute top-0 left-1/2 h-9 w-1 origin-top -translate-x-1/2 rounded-full bg-foreground"
      animate={{ rotate: [from, to] }}
      transition={{ duration: 0.42, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
    />
  );
}

function Walker() {
  return (
    <Stick
      legs={
        <>
          <Leg from={-26} to={26} />
          <Leg from={26} to={-26} />
        </>
      }
    />
  );
}

function Jumper() {
  return (
    <motion.div
      animate={{ y: [0, -26, 0], scaleY: [1, 1.08, 0.82, 1] }}
      transition={{ duration: 0.65, repeat: Infinity, times: [0, 0.45, 0.72, 1], ease: "easeOut" }}
    >
      <Stick
        legs={
          <>
            <div className="absolute top-0 left-1/2 h-9 w-1 origin-top -translate-x-1/2 rotate-[-22deg] rounded-full bg-foreground" />
            <div className="absolute top-0 left-1/2 h-9 w-1 origin-top -translate-x-1/2 rotate-22 rounded-full bg-foreground" />
          </>
        }
      />
    </motion.div>
  );
}

function Ring() {
  return (
    <motion.div
      className="size-14 rounded-full border-4 border-muted border-t-foreground"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
    />
  );
}

function Orbits({ dots }: { dots: Orbit[] }) {
  return (
    <div className="relative size-40">
      {dots.map((dot, i) => (
        <motion.div
          key={i}
          className="absolute top-1/2 left-1/2"
          style={{ width: dot.r * 2, height: dot.r * 2, marginLeft: -dot.r, marginTop: -dot.r }}
          animate={{ rotate: 360 }}
          transition={{ duration: dot.dur, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-foreground" style={{ width: dot.size, height: dot.size }} />
        </motion.div>
      ))}
    </div>
  );
}

function Swarm() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 12 }, (_, i) => (
        <motion.div
          key={i}
          className="size-4 bg-foreground"
          animate={{ rotate: 360, borderRadius: ["0%", "50%", "0%"] }}
          transition={{ duration: 1.2 + (i % 4) * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }}
        />
      ))}
    </div>
  );
}

function Bounce() {
  return (
    <div className="flex h-16 items-end gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <motion.div
          key={i}
          className="size-3 rounded-full bg-foreground"
          animate={{ y: [0, -28, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 }}
        />
      ))}
    </div>
  );
}
