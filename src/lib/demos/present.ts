import type { ChoiceAnswer, ScoreAnswer } from "../jev/types";
import type { VizItem } from "./types";

export function nItem(label: string, p: number, caption?: string): VizItem {
  return { kind: "noul", label, p, caption };
}

export function cItem(label: string, answer: ChoiceAnswer, caption?: string): VizItem {
  return {
    kind: "choice",
    label,
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    caption,
  };
}

export function sItem(label: string, answer: ScoreAnswer, caption?: string): VizItem {
  return {
    kind: "score",
    label,
    score: answer.score,
    confidence: answer.confidence,
    legend: answer.legend,
    probabilities: answer.probabilities,
    caption,
  };
}

export function fItem(label: string, value: string, detail?: string): VizItem {
  return { kind: "field", label, value, detail };
}

export function mItem(label: string, value: number, caption?: string): VizItem {
  return { kind: "meter", label, value, caption };
}
