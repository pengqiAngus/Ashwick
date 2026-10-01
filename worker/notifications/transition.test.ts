import { describe, expect, it } from "vitest";
import { alertTransition } from "@worker/notifications/transition";

describe("alertTransition", () => {
  const base = { previousRangeKey: "10:20", rangeKey: "10:20", low: "10", high: "20", price: "15" };

  it("includes both boundaries", () => {
    expect(alertTransition({ ...base, price: "10", previousInRange: false }).entered).toBe(true);
    expect(alertTransition({ ...base, price: "20", previousInRange: false }).entered).toBe(true);
  });

  it("only enters once while price remains inside", () => {
    expect(alertTransition({ ...base, previousInRange: false }).entered).toBe(true);
    expect(alertTransition({ ...base, previousInRange: true }).entered).toBe(false);
  });

  it("enters again after leaving the range", () => {
    expect(alertTransition({ ...base, price: "25", previousInRange: true }).entered).toBe(false);
    expect(alertTransition({ ...base, price: "15", previousInRange: false }).entered).toBe(true);
  });

  it("resets the edge state when the range changes", () => {
    expect(alertTransition({ ...base, previousInRange: true, previousRangeKey: "1:2", rangeKey: "10:20" }).entered).toBe(true);
  });
});
