export type ActivityTone = "favorite" | "long" | "short" | "target";

const ACTIVITY_MARK = /(收藏|开多|开空)|目标区间设为\s+(\S+\s+–\s+\S+)/g;

/** 收藏、开多、开空整词上色；目标区间只给后面的价格上色。 */
export function splitActivitySummary(summary: string): { text: string; tone: ActivityTone | null }[] {
  const parts: { text: string; tone: ActivityTone | null }[] = [];
  let last = 0;
  for (const match of summary.matchAll(ACTIVITY_MARK)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: summary.slice(last, index), tone: null });
    const word = match[1];
    if (word) {
      const tone: ActivityTone = word === "收藏" ? "favorite" : word === "开多" ? "long" : "short";
      parts.push({ text: word, tone });
    } else {
      const prices = match[2];
      parts.push({ text: match[0].slice(0, match[0].length - prices.length), tone: null });
      parts.push({ text: prices, tone: "target" });
    }
    last = index + match[0].length;
  }
  if (last < summary.length) parts.push({ text: summary.slice(last), tone: null });
  if (parts.length === 0) parts.push({ text: summary, tone: null });
  return parts;
}
