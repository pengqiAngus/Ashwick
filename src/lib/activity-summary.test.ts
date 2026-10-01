import { describe, expect, it } from "vitest";
import { splitActivitySummary } from "@/lib/activity-summary";

describe("splitActivitySummary", () => {
  it("给收藏、方向和目标区间标颜色", () => {
    expect(splitActivitySummary("收藏")).toEqual([{ text: "收藏", tone: "favorite" }]);
    expect(splitActivitySummary("开仓方向改为开多")).toEqual([
      { text: "开仓方向改为", tone: null },
      { text: "开多", tone: "long" },
    ]);
    expect(splitActivitySummary("开仓方向改为开空")).toEqual([
      { text: "开仓方向改为", tone: null },
      { text: "开空", tone: "short" },
    ]);
    expect(splitActivitySummary("目标区间设为 1,234.50 – 1,300.00")).toEqual([
      { text: "目标区间设为 ", tone: null },
      { text: "1,234.50 – 1,300.00", tone: "target" },
    ]);
    expect(splitActivitySummary("移除目标区间")).toEqual([{ text: "移除目标区间", tone: null }]);
    expect(splitActivitySummary("保存备注")).toEqual([{ text: "保存备注", tone: null }]);
  });
});
