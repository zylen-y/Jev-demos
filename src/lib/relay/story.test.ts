import { describe, expect, it } from "vitest";
import { mentionsElection, pickRuleFlips, pickShowcase, sampleVerdict, storyCaption, type FlipRow } from "./story";

function row(title: string, before: FlipRow["before"], after: FlipRow["after"], summary = ""): FlipRow {
  return { before, after, edit: { title, summary } };
}

describe("story captions", () => {
  it("names the wave and says red means the verdict changed", () => {
    const copy = storyCaption("wave", 2400);
    expect(copy.title).toContain("2,400");
    expect(copy.detail).toBe("Red means the verdict changed.");
    expect(storyCaption("card", 2400).detail).toBe("What a policy change would have done, before you ship it.");
  });
});

describe("rule flips", () => {
  it("puts election edits that became revert ahead of review-to-keep churn", () => {
    const rows = [
      row("Starships (song)", "review", "keep"),
      row("Abran, Ladakh", "review", "keep"),
      row("2024 United Kingdom general election", "keep", "revert"),
      row("Tu Veneno", "revert", "keep"),
      row("Opinion polling for the next election", "review", "revert", "second round"),
    ];
    const picked = pickRuleFlips(rows, rows.length, 3);
    expect(picked.map((item) => item.edit.title)).toEqual([
      "Opinion polling for the next election",
      "2024 United Kingdom general election",
    ]);
    expect(mentionsElection("Tamil Nadu election", "")).toBe(true);
    expect(mentionsElection("Site selection for the convention", "")).toBe(false);
    expect(mentionsElection("United States presidential elections", "")).toBe(true);
    expect(pickShowcase(rows, rows.length, 3).map((item) => item.edit.title)).toEqual([
      "Opinion polling for the next election",
      "2024 United Kingdom general election",
    ]);
    const mixed = [
      row("Forward Party (United States)", "keep", "revert", "ballot access"),
      row("Tepuh", "review", "revert", "electoral map"),
      row("2026 Senate election", "keep", "revert"),
      row("Maine election results", "review", "revert"),
    ];
    expect(pickShowcase(mixed, mixed.length, 3).map((item) => item.edit.title)).toEqual([
      "Maine election results",
      "2026 Senate election",
    ]);
    expect(sampleVerdict([
      { before: "keep" as const, edit: { title: "File:Cat.jpg" } },
      { before: "keep" as const, edit: { title: "Q1088552" } },
      { before: "review" as const, edit: { title: "Starships (song)" } },
    ])?.edit.title).toBe("Starships (song)");
  });
});
