import { describe, expect, it } from "vitest";
import { describeNoteChange, describeSideChange, describeTargetChange } from "@/lib/favorites";

describe("收藏操作说明", () => {
  it("方向", () => {
    expect(describeSideChange("long")).toBe("开仓方向改为开多");
    expect(describeSideChange("short")).toBe("开仓方向改为开空");
    expect(describeSideChange(null)).toBe("清除开仓方向");
  });

  it("目标区间", () => {
    expect(describeTargetChange("0.2", "0.21")).toBe("目标区间设为 0.20 – 0.21");
    expect(describeTargetChange(null, null)).toBe("移除目标区间");
  });

  it("备注", () => {
    expect(describeNoteChange("hi")).toBe("保存备注");
    expect(describeNoteChange(null)).toBe("清空备注");
  });
});
