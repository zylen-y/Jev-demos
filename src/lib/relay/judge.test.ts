import { describe, expect, it } from "vitest";
import { cellTone, countFlips, mockAction, readyPrefix, waveIndexAt, WAVE_MS } from "./judge";
import { editFromApiRow, editFromEvent } from "./wiki";
import { relayRecordPlan } from "./record";

const vandal = {
  id: "enwiki:1",
  title: "Election night",
  wiki: "enwiki",
  summary: "Reverted a breaking news score",
  user: "Ada",
  bot: false,
  byteDelta: 20,
};

describe("wikipedia edits", () => {
  it("reads a recentchange event and an API row", () => {
    const fromStream = editFromEvent({
      type: "edit",
      id: 99,
      wiki: "dewiki",
      title: "Berlin",
      comment: "typo",
      user: "Bee",
      bot: false,
      length: { old: 10, new: 12 },
    });
    expect(fromStream).toMatchObject({ id: "dewiki:99", title: "Berlin", wiki: "dewiki", byteDelta: 2 });
    expect(editFromEvent({ type: "log", title: "User:Ada", wiki: "enwiki" })).toBeNull();
    const fromApi = editFromApiRow({ type: "edit", title: "Paris", comment: "cite", rcid: 5, oldlen: 3, newlen: 8 });
    expect(fromApi).toMatchObject({ id: "enwiki:5", byteDelta: 5, summary: "cite" });
  });
});

describe("policy flips", () => {
  it("flips a harsh policy and paints a top-to-bottom wave", () => {
    expect(mockAction(vandal, "Keep ordinary edits and typo fixes.")).toBe("keep");
    expect(mockAction(vandal, "Revert edits whose summary says reverted, plus elections.")).toBe("revert");
    const rows = [
      { before: "keep" as const, after: "revert" as const },
      { before: "keep" as const, after: "keep" as const },
      { before: "keep" as const, after: null },
    ];
    expect(countFlips(rows, 2)).toEqual({ flipped: 1, unchanged: 1 });
    expect(cellTone(rows[0], 0, 2)).toBe("flipped");
    expect(cellTone(rows[1], 1, 2)).toBe("unchanged");
    expect(cellTone(rows[2], 2, 1)).toBe("pending");
    expect(waveIndexAt(0, 2400)).toBe(0);
    expect(waveIndexAt(WAVE_MS / 2, 2400)).toBe(1200);
    expect(waveIndexAt(WAVE_MS, 2400)).toBe(2400);
    expect(readyPrefix(rows)).toBe(2);
    expect(readyPrefix([{ before: "keep", after: null, failed: true }])).toBe(1);
    expect(readyPrefix([{ before: null, after: null, failed: true }])).toBe(1);
    expect(readyPrefix([{ before: "keep", after: null }, { before: "keep", after: "revert" }])).toBe(0);
  });
});

describe("relay recorder", () => {
  it("plans a labeled mock without a key and refuses a live clip", () => {
    const mock = relayRecordPlan({ mock: true, baseURL: "http://localhost:3000/" });
    expect(mock).toMatchObject({ ok: true, mock: true, coldOpen: "/relay?mock=1&scene=wave" });
    expect(relayRecordPlan({ key: "" }).ok).toBe(false);
    expect(relayRecordPlan({ key: "ts_live_example" })).toMatchObject({
      ok: true,
      mock: false,
      story: "/relay",
      coldOpen: "/relay?scene=wave&autostart=1",
    });
  });
});
