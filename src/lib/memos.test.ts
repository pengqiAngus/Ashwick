import { describe, expect, it } from "vitest";
import { MemoError, normalizeMemoBody } from "@/lib/memos";

describe("normalizeMemoBody", () => {
  it("去掉首尾空白", () => {
    expect(normalizeMemoBody("  hi  ")).toBe("hi");
  });

  it("空白视为空", () => {
    expect(() => normalizeMemoBody("  \n")).toThrow(MemoError);
  });

  it("超过 2000 字拒绝", () => {
    expect(() => normalizeMemoBody("a".repeat(2001))).toThrow(/2000/);
  });
});
