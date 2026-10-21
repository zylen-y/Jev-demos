import type { ChoiceQuestion, NoulQuestion, QuestionEntry, ScoreQuestion, SystemOneRequest } from "./types";
import { JEV_MODEL } from "./types";

export function noul(
  instructions: QuestionEntry,
  criteria?: { true: QuestionEntry; false: QuestionEntry },
): NoulQuestion {
  return criteria
    ? { type: "noul", instructions, criteria }
    : { type: "noul", instructions };
}

export function choice(
  instructions: QuestionEntry,
  criteria: Record<string, QuestionEntry | null>,
): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

export function score(instructions: string, criteria: readonly string[]): ScoreQuestion {
  if (criteria.length < 2) {
    throw new Error("Score criteria need at least two levels.");
  }
  return { type: "score", instructions, criteria: [...criteria] };
}

export function request(
  state: SystemOneRequest["state"],
  questions: SystemOneRequest["questions"],
  model = JEV_MODEL,
): SystemOneRequest {
  return { model, state, questions };
}
