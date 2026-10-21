import { choice, request } from "../jev/questions";
import type { Answer, SystemOneRequest } from "../jev/types";
import { readChoice } from "../jev/parse";
import type { WikiEdit } from "./wiki";

export const RELAY_ACTIONS = ["keep", "review", "revert"] as const;
export type RelayAction = (typeof RELAY_ACTIONS)[number];

export const DEFAULT_POLICY =
  "Keep ordinary edits, citation repairs, and typo fixes. Review an empty summary on a large change. Revert vandalism, spam, promotional links, and page blanking.";

export const REJUDGE_POLICY =
  "Revert edits whose summary says reverted, or that mention a category, a sports result, an election, or breaking news. Keep typo and citation fixes.";

/** Short rule the recorder pastes. A viewer can read it in one glance. */
export const RECORD_POLICY = "Revert anything that mentions the election";

export const WAVE_MS = 1400;

/** Mocked re-judge only. Live rows flip as responses land, so they do not use this clock. */
export const MOCK_PLAYBACK_MS = 4000;

export function relayRequest(edit: WikiEdit, policy: string): SystemOneRequest {
  return request(
    {
      policy,
      wiki: edit.wiki,
      title: edit.title,
      summary: edit.summary,
      user: edit.user,
      bot: edit.bot ? "yes" : "no",
    },
    {
      action: choice("Under `policy`, what should happen to this edit?", {
        keep: "The policy would leave the edit in place.",
        review: "The policy would send the edit to a human.",
        revert: "The policy would revert the edit.",
      }),
    },
  );
}

export function actionFromAnswers(answers: Record<string, Answer>): RelayAction {
  const choice = readChoice(answers, "action").choice;
  if (choice === "review" || choice === "revert" || choice === "keep") return choice;
  return "review";
}

/** Local stand-in used only when the page is explicitly marked mocked. */
export function mockAction(edit: WikiEdit, policy: string): RelayAction {
  const text = `${edit.title}\n${edit.summary}`.toLowerCase();
  const rule = policy.toLowerCase();
  if (/mentions the election/.test(rule) && /election|elected|electoral|ballot|referendum/.test(text)) {
    return "revert";
  }
  if (/revert edits whose summary says reverted/.test(rule) && /revert|category|election|score|died|wins|breaking|goal/.test(text)) {
    return "revert";
  }
  if (/viagra|casino|buy now|seo service|click here/.test(text)) return "revert";
  if (!edit.summary.trim() && Math.abs(edit.byteDelta) > 800) return "review";
  return "keep";
}

export function waveIndexAt(elapsedMs: number, total: number): number {
  if (total <= 0) return 0;
  const t = Math.min(1, Math.max(0, elapsedMs / WAVE_MS));
  return Math.min(total, Math.floor(t * total));
}

export type JudgedRow = {
  before: RelayAction | null;
  after: RelayAction | null;
  /** A call was attempted and did not return a decision. The wave may pass it. */
  failed?: boolean;
};

export function readyPrefix(rows: readonly JudgedRow[]): number {
  let count = 0;
  for (const row of rows) {
    if (!row) break;
    if (row.failed) {
      count += 1;
      continue;
    }
    if (row.before == null || row.after == null) break;
    count += 1;
  }
  return count;
}

export function countFlips(rows: readonly JudgedRow[], revealed: number): { flipped: number; unchanged: number } {
  let flipped = 0;
  let unchanged = 0;
  const end = Math.min(rows.length, Math.max(0, revealed));
  for (let index = 0; index < end; index += 1) {
    const row = rows[index];
    if (!row || row.before == null || row.after == null) continue;
    if (row.before !== row.after) flipped += 1;
    else unchanged += 1;
  }
  return { flipped, unchanged };
}

export function cellTone(row: JudgedRow, index: number, revealed: number): "pending" | "unchanged" | "flipped" {
  if (index >= revealed || row.after == null || row.before == null) return "pending";
  return row.before === row.after ? "unchanged" : "flipped";
}
