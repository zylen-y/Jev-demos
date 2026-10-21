import { choice, noul, request } from "../jev/questions";
import type { Answer, SystemOneRequest } from "../jev/types";
import { readChoice, readNoul } from "../jev/parse";
import type { WikiEdit } from "./wiki";

export const RELAY_ACTIONS = ["keep", "review", "revert"] as const;
export type RelayAction = (typeof RELAY_ACTIONS)[number];

export const DEFAULT_POLICY =
  "Keep ordinary edits, citation repairs, and typo fixes. Review an empty summary on a large change. Revert vandalism, spam, promotional links, and page blanking.";

export const REJUDGE_POLICY =
  "Revert edits whose summary says reverted, or that mention a category, a sports result, an election, or breaking news. Keep typo and citation fixes.";

/**
 * Added clause the recorder types. The standing policy stays in force.
 * A viewer can read both sentences while the rule is typed.
 */
export const RECORD_POLICY =
  "Revert an edit whose article or summary is about an election. Leave every other edit as the standing policy decided.";

/** A noul at or above this is a yes, the same cutoff the rest of the atlas uses. */
export const CLAUSE_YES = 0.5;

export const WAVE_MS = 1400;

/** Mocked re-judge only. Live rows flip as responses land, so they do not use this clock. */
export const MOCK_PLAYBACK_MS = 4000;

export function isAddedClause(policy: string): boolean {
  return policy.trim() !== DEFAULT_POLICY.trim();
}

/** Labeled fields, so the article and the summary cannot blur into the verdict. */
export function editState(edit: WikiEdit): Record<string, string> {
  return {
    article_title: edit.title,
    edit_summary: edit.summary,
    wiki: edit.wiki,
    editor: edit.user,
    bot_edit: edit.bot ? "yes" : "no",
  };
}

function standingChoice(policy: string) {
  return choice(
    {
      question: "Under the standing policy, what should happen to this edit?",
      standing_policy: policy,
      read: "Judge article_title and edit_summary. A word inside the edit summary is not the decision.",
    },
    {
      keep: {
        meaning: "Leave the edit in place.",
        not: "Do not choose this just because the summary never says revert.",
      },
      review: {
        meaning: "Send the edit to a human.",
        usual: "An empty summary on a large change.",
      },
      revert: {
        meaning: "Undo vandalism, spam, promotional links, or page blanking.",
        not: "A summary that only says the edit was reverted, undone, or made by a bot is not this decision.",
      },
    },
  );
}

function clauseNoul(clause: string) {
  return noul(
    {
      question: "Does the added rule apply to this edit?",
      added_rule: clause,
      yes: "The article title or the edit summary is what the added rule names. An article about an election counts even when the summary only records a revert or an undo.",
      no: "The added rule does not apply. On any other article, a summary that only records a revert, an undo, or a bot maintenance edit is not a match. The word revert is not itself a yes.",
    },
    {
      true: "The added rule applies to the article or the summary.",
      false: "The added rule does not apply.",
    },
  );
}

export function relayRequest(edit: WikiEdit, policy: string): SystemOneRequest {
  return request(editState(edit), { action: standingChoice(policy) });
}

/** The re-judge. One yes/no about the added clause. The standing decision stays in our code. */
export function addedClauseRequest(edit: WikiEdit, clause: string): SystemOneRequest {
  return request(editState(edit), { rule_applies: clauseNoul(clause) });
}

/** A new edit has no standing decision yet, so one call asks both and code composes them. */
export function incomingClauseRequest(edit: WikiEdit, clause: string): SystemOneRequest {
  return request(editState(edit), {
    action: standingChoice(DEFAULT_POLICY),
    rule_applies: clauseNoul(clause),
  });
}

export function clauseApplies(noulValue: number): boolean {
  return Number.isFinite(noulValue) && noulValue >= CLAUSE_YES;
}

/** Yes on the added clause becomes revert. No leaves the standing decision. */
export function applyAddedClause(standing: RelayAction, applies: boolean): RelayAction {
  return applies ? "revert" : standing;
}

export function actionFromClause(answers: Record<string, Answer>, standing: RelayAction): RelayAction {
  return applyAddedClause(standing, clauseApplies(readNoul(answers, "rule_applies")));
}

export function actionFromIncoming(answers: Record<string, Answer>): RelayAction {
  return applyAddedClause(actionFromAnswers(answers), clauseApplies(readNoul(answers, "rule_applies")));
}

export function actionFromAnswers(answers: Record<string, Answer>): RelayAction {
  const choice = readChoice(answers, "action").choice;
  if (choice === "review" || choice === "revert" || choice === "keep") return choice;
  return "review";
}

/** Whole words, so "site selection" does not count as an election. */
export function mentionsElection(title: string, summary = ""): boolean {
  return /\b(elections?|elected|electoral|ballot|referendum)\b/i.test(`${title}\n${summary}`);
}

/**
 * Local stand-in for the added-clause yes/no. It reads the clause the viewer
 * typed. It is the mock verdict, not a filter applied after a model answer.
 */
export function mockClauseApplies(edit: WikiEdit, clause: string): boolean {
  if (!/\belections?\b/i.test(clause)) return false;
  return mentionsElection(edit.title, edit.summary);
}

/** Standing decision, then the added clause when the box is no longer the standing policy. */
export function mockCurrent(edit: WikiEdit, policy: string): RelayAction {
  const standing = mockAction(edit, isAddedClause(policy) ? DEFAULT_POLICY : policy);
  if (!isAddedClause(policy)) return standing;
  return applyAddedClause(standing, mockClauseApplies(edit, policy));
}

/** Local stand-in used only when the page is explicitly marked mocked. */
export function mockAction(edit: WikiEdit, policy: string): RelayAction {
  const text = `${edit.title}\n${edit.summary}`.toLowerCase();
  const rule = policy.toLowerCase();
  if (/mentions the election/.test(rule) && mentionsElection(text)) {
    return "revert";
  }
  if (/revert edits whose summary says reverted/.test(rule) && /\b(revert|category|elections?|score|died|wins|breaking|goal)\b/.test(text)) {
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
