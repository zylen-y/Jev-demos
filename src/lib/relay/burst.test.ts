import { describe, expect, it } from "vitest";
import { backoffMs, chunkItems, shouldRetryStatus } from "./burst";

describe("relay burst", () => {
  it("chunks a backlog into bounded groups and backs off on 429 and 529", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(529)).toBe(true);
    expect(shouldRetryStatus(401)).toBe(false);
    expect(backoffMs(0)).toBe(400);
    expect(backoffMs(1)).toBe(800);
    expect(backoffMs(8)).toBe(5_000);
  });
});
