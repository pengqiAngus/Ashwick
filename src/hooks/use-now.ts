"use client";

import { useEffect, useState } from "react";

/** 每 intervalMs 更新一次的当前时间，用于“x 秒前”和过期判断 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
