import { describe, expect, it } from "vitest";
import { censusAddsUp, placeStreamEdit, readoutAddsUp, relayCensus, relayReadout } from "./census";
import { mockAction, RECORD_POLICY, type JudgedRow } from "./judge";

const keep = { before: "keep" as const, after: "keep" as const };
const flip = { before: "keep" as const, after: "revert" as const };
const gap = { before: "keep" as const, after: null };
const failed = { before: null, after: null, failed: true };

describe("relay census", () => {
  it("makes flipped, unchanged, and failed add up to the revealed prefix", () => {
    const rows = [flip, keep, failed, gap, flip];
    const census = relayCensus(rows, rows.length);
    expect(census.flipped).toBe(1);
    expect(census.unchanged).toBe(1);
    expect(census.failed).toBe(1);
    expect(census.shown).toBe(3);
    expect(census.waiting).toBe(2);
    expect(census.decided).toBe(4);
    expect(census.total).toBe(5);
    expect(censusAddsUp(census)).toBe(true);
    expect(census.flipped + census.unchanged).not.toBe(census.total);
  });

  it("publishes one readout so the on-screen counters cannot disagree", () => {
    const rows = [flip, keep, failed, gap, flip];
    const census = relayCensus(rows, rows.length);
    const sweep = relayReadout(census, true);
    expect(sweep.headline).toBe(census.flipped);
    expect(sweep.decisions).toBe(census.shown);
    expect(sweep.progress).toBe(sweep.decisions);
    expect(sweep.headline + census.unchanged + census.failed).toBe(sweep.decisions);
    expect(readoutAddsUp(census, sweep)).toBe(true);
    const baseline = relayReadout(census, false);
    expect(baseline.headline).toBe(census.decided);
    expect(baseline.decisions).toBe(census.decided);
    expect(baseline.progress).toBe(census.decided);
    expect(readoutAddsUp(census, baseline)).toBe(true);
  });

  it("does not count a result that landed past an open gap", () => {
    const census = relayCensus([gap, flip], 2);
    expect(census.flipped).toBe(0);
    expect(census.shown).toBe(0);
    expect(census.waiting).toBe(2);
    expect(censusAddsUp(census)).toBe(true);
  });

  it("keeps a frozen grid byte-for-byte when a stream edit arrives", () => {
    const grid: JudgedRow[] = [flip, keep, flip];
    const before = relayCensus(grid, grid.length);
    const placed = placeStreamEdit(grid, [], gap, true, 3);
    expect(placed.grid).toEqual(grid);
    expect(placed.incoming).toEqual([gap]);
    expect(relayCensus(placed.grid, placed.grid.length)).toEqual(before);
    const open = placeStreamEdit(grid, [], gap, false, 3);
    expect(open.grid[0]).toBe(gap);
    expect(open.grid).toHaveLength(3);
  });
});

describe("record policy", () => {
  it("reverts an edit that mentions an election", () => {
    expect(
      mockAction(
        { id: "enwiki:1", title: "Election night", wiki: "enwiki", summary: "copyedit", user: "Ada", bot: false, byteDelta: 20 },
        RECORD_POLICY,
      ),
    ).toBe("revert");
    expect(
      mockAction(
        { id: "enwiki:2", title: "Linen", wiki: "enwiki", summary: "typo", user: "Ada", bot: false, byteDelta: 2 },
        RECORD_POLICY,
      ),
    ).toBe("keep");
  });
});
