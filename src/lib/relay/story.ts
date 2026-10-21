import { mentionsElection, type RelayAction } from "./judge";

export { mentionsElection };

export const STORY_STEPS = ["stream", "judge", "change", "wave", "examples", "card"] as const;
export type StoryStep = (typeof STORY_STEPS)[number];

export function isStoryStep(value: string): value is StoryStep {
  return (STORY_STEPS as readonly string[]).includes(value);
}

export type StoryCopy = { title: string; detail: string | null };

export function storyCaption(step: StoryStep, total: number): StoryCopy {
  const count = total.toLocaleString();
  switch (step) {
    case "stream":
      return { title: "These are live Wikipedia edits, happening right now.", detail: null };
    case "judge":
      return {
        title: "Jev judges every edit against a plain-English rule: keep, review, or revert.",
        detail: null,
      };
    case "change":
      return { title: "Change the rule…", detail: null };
    case "wave":
      return {
        title: `…and re-judge the last ${count} edits at once.`,
        detail: "Red means the new rule reverts it.",
      };
    case "examples":
      return { title: "These mention an election, so the new rule reverts them.", detail: null };
    case "card":
      return { title: "", detail: "What a policy change would have done, before you ship it." };
  }
}

export type FlipRow = {
  before: RelayAction | null;
  after: RelayAction | null;
  edit: { title: string; summary: string };
};

function toRevert(row: FlipRow): boolean {
  return row.before != null && row.after === "revert" && row.before !== "revert";
}

export function titleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeTitles<T extends FlipRow>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const key = titleKey(row.edit.title);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}

/** Edits in the revealed prefix that the election rule newly reverts. */
export function countRuleReverts<T extends FlipRow>(rows: readonly T[], revealed: number): number {
  const end = Math.min(rows.length, Math.max(0, Math.floor(revealed)));
  let count = 0;
  for (let index = 0; index < end; index += 1) {
    const row = rows[index];
    if (!row || !toRevert(row) || !mentionsElection(row.edit.title, row.edit.summary)) continue;
    count += 1;
  }
  return count;
}

/** Revealed election → REVERT rows, one card per page title. Other churn stays off this list. */
export function pickRuleFlips<T extends FlipRow>(rows: readonly T[], revealed: number, limit: number): T[] {
  const end = Math.min(rows.length, Math.max(0, Math.floor(revealed)));
  const ranked: { row: T; index: number; rank: number }[] = [];
  for (let index = 0; index < end; index += 1) {
    const row = rows[index];
    if (!row || !toRevert(row) || !mentionsElection(row.edit.title, row.edit.summary)) continue;
    const titled = mentionsElection(row.edit.title, "");
    ranked.push({ row, index, rank: titled ? 2 : 1 });
  }
  ranked.sort((a, b) => b.rank - a.rank || b.index - a.index);
  return dedupeTitles(ranked.map((item) => item.row)).slice(0, Math.max(0, limit));
}

/** The held examples. Election → REVERT wins when at least two of those exist. */
export function pickShowcase<T extends FlipRow>(rows: readonly T[], revealed: number, limit: number): T[] {
  const ranked = pickRuleFlips(rows, revealed, rows.length);
  const titled = ranked.filter((row) => toRevert(row) && mentionsElection(row.edit.title, ""));
  if (titled.length >= 2) return titled.slice(0, limit);
  const matching = ranked.filter((row) => toRevert(row) && mentionsElection(row.edit.title, row.edit.summary));
  if (matching.length >= 2) return matching.slice(0, limit);
  return ranked.slice(0, limit);
}

function readableArticle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length < 8 || !trimmed.includes(" ")) return false;
  if (/^(file|image|user|user talk|wikipedia|category|template|draft|module|timedtext):/i.test(trimmed)) return false;
  if (/^Q\d+/i.test(trimmed)) return false;
  return /[A-Za-z]{3}/.test(trimmed);
}

export function sampleVerdict<T extends { before: RelayAction | null; edit: { title: string } }>(rows: readonly T[]): T | null {
  const judged = rows.filter((row) => row.before != null && row.edit.title.trim());
  return judged.find((row) => readableArticle(row.edit.title)) ?? judged[0] ?? null;
}
