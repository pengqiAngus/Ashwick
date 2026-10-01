import { describe, expect, it } from "vitest";
import { resolveThemeId, THEME_STORAGE_KEY, themeBootScript } from "@/lib/theme";

describe("resolveThemeId", () => {
  it("未知值回到黑色", () => {
    expect(resolveThemeId(null)).toBe("dark");
    expect(resolveThemeId("blue")).toBe("dark");
  });

  it("接受白名单", () => {
    expect(resolveThemeId("light")).toBe("light");
    expect(resolveThemeId("dark")).toBe("dark");
  });
});

describe("themeBootScript", () => {
  it("包含存储键和现有主题 class", () => {
    const script = themeBootScript();
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain('"className":"dark"');
    expect(script).toContain('"className":"light"');
  });
});
