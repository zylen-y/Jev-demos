import { describe, expect, it } from "vitest";
import { validateSystemOneBody } from "../jev/validate";
import { CLAUSE_SAMPLES } from "./clause-samples";
import { scoreClause } from "./clause-eval";
import {
  addedClauseRequest,
  applyAddedClause,
  CLAUSE_YES,
  clauseApplies,
  mockClauseApplies,
  RECORD_POLICY,
} from "./judge";

describe("added clause", () => {
  it("asks one yes/no and keeps the standing decision when the answer is no", () => {
    const edit = {
      id: "enwiki:1",
      title: "Shoe",
      wiki: "enwiki",
      summary: "Reverted edits by [[Special:Contribs/Ada]]",
      user: "Ada",
      bot: false,
      byteDelta: 4,
    };
    const request = addedClauseRequest(edit, RECORD_POLICY);
    expect(request.state).toMatchObject({ article_title: "Shoe", edit_summary: edit.summary, bot_edit: "no" });
    expect(Object.keys(request.questions)).toEqual(["rule_applies"]);
    const question = request.questions.rule_applies;
    expect(question?.type).toBe("noul");
    expect(JSON.stringify(question)).toMatch(/word revert is not itself a yes/);
    expect(JSON.stringify(question)).not.toMatch(/"type":"choice"/);
    const checked = validateSystemOneBody(request);
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      const forwarded = checked.request.questions.rule_applies;
      expect(forwarded?.type).toBe("noul");
      if (forwarded?.type === "noul" && forwarded.instructions && typeof forwarded.instructions === "object") {
        expect(forwarded.instructions).toMatchObject({ question: "Does the added rule apply to this edit?" });
      }
    }
    expect(clauseApplies(CLAUSE_YES)).toBe(true);
    expect(clauseApplies(CLAUSE_YES - 0.01)).toBe(false);
    expect(applyAddedClause("review", false)).toBe("review");
    expect(applyAddedClause("keep", true)).toBe("revert");
    expect(applyAddedClause("revert", false)).toBe("revert");
    expect(mockClauseApplies(edit, RECORD_POLICY)).toBe(false);
  });
});

describe("clause eval set", () => {
  it("holds real election, revert-summary, and bot edits, and a revert-word detector scores poorly", () => {
    expect(CLAUSE_SAMPLES.length).toBeGreaterThanOrEqual(50);
    expect(CLAUSE_SAMPLES.length).toBeLessThanOrEqual(100);
    const yes = CLAUSE_SAMPLES.filter((sample) => sample.aboutElection);
    const revertNotes = CLAUSE_SAMPLES.filter(
      (sample) => /\b(reverted|undid revision)\b/i.test(sample.edit.summary) && !sample.aboutElection,
    );
    const bots = CLAUSE_SAMPLES.filter((sample) => sample.edit.bot && !sample.aboutElection);
    expect(yes.length).toBeGreaterThanOrEqual(15);
    expect(revertNotes.length).toBeGreaterThanOrEqual(8);
    expect(bots.length).toBeGreaterThanOrEqual(5);
    expect(bots.some((sample) => sample.edit.summary === "ТӀейузар")).toBe(true);
    expect(yes.some((sample) => /undid revision/i.test(sample.edit.summary))).toBe(true);
    const literal = scoreClause(
      CLAUSE_SAMPLES.map((sample) => ({
        aboutElection: sample.aboutElection,
        predicted: /\brevert/i.test(sample.edit.summary),
      })),
    );
    expect(literal.precision).not.toBeNull();
    expect(literal.precision ?? 1).toBeLessThan(0.5);
    const perfect = scoreClause(CLAUSE_SAMPLES.map((sample) => ({ aboutElection: sample.aboutElection, predicted: sample.aboutElection })));
    expect(perfect.precision).toBe(1);
    expect(perfect.recall).toBe(1);
    expect(perfect.tp + perfect.fp + perfect.fn + perfect.tn).toBe(CLAUSE_SAMPLES.length);
  });
});
