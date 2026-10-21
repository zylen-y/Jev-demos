import { describe, expect, it } from "vitest";
import { columnsFor, flippedFill } from "./paint";

describe("relay paint", () => {
  it("uses bright red only for a revert the new rule caused", () => {
    expect(flippedFill("keep", true, true)).toBe("#ff3b1f");
    expect(flippedFill("keep", true, false)).toBe("#4a403c");
    expect(flippedFill("keep", false, false)).toBe("#1f8f52");
  });

  it("keeps a desktop backlog on whole bands and a phone field tall enough to see", () => {
    expect(columnsFor(1440, 720, 2400)).toBe(48);
    expect(2400 % 48).toBe(0);
    const phone = columnsFor(390, 520, 2400);
    expect(phone).toBeGreaterThanOrEqual(16);
    const rows = Math.ceil(2400 / phone);
    const gap = 1.5;
    const cell = (520 - gap * (rows - 1)) / rows;
    expect(cell).toBeGreaterThanOrEqual(5);
  });
});
