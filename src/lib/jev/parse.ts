import type { Answer, ChoiceAnswer, NoulAnswer, ScoreAnswer, SystemOneResponse, Usage } from "./types";

export function parseSystemOneResponse(value: unknown): SystemOneResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Jev returned a response that was not an object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || !record.answers || typeof record.answers !== "object") {
    throw new Error("Jev returned a response without a model and answers.");
  }
  const answers: Record<string, Answer> = {};
  for (const [id, answer] of Object.entries(record.answers as Record<string, unknown>)) {
    answers[id] = parseAnswer(id, answer);
  }
  return {
    model: record.model,
    answers,
    usage: parseUsage(record.usage),
  };
}

function parseUsage(value: unknown): Usage {
  if (!value || typeof value !== "object") {
    return { input_tokens: null, output_tokens: null };
  }
  const usage = value as Record<string, unknown>;
  return {
    input_tokens: finite(usage.input_tokens),
    output_tokens: finite(usage.output_tokens),
  };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseAnswer(id: string, value: unknown): Answer {
  if (!value || typeof value !== "object") {
    throw new Error(`Answer "${id}" was empty.`);
  }
  const answer = value as Record<string, unknown>;
  if (answer.type === "noul" && typeof answer.noul === "number") {
    return { type: "noul", noul: answer.noul };
  }
  if (
    answer.type === "choice" &&
    typeof answer.choice === "string" &&
    typeof answer.confidence === "number" &&
    answer.probabilities &&
    typeof answer.probabilities === "object"
  ) {
    return {
      type: "choice",
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: numberMap(answer.probabilities),
    };
  }
  if (
    answer.type === "score" &&
    typeof answer.score === "number" &&
    typeof answer.confidence === "number" &&
    answer.legend &&
    typeof answer.legend === "object" &&
    answer.probabilities &&
    typeof answer.probabilities === "object"
  ) {
    const legend: Record<string, string> = {};
    for (const [key, label] of Object.entries(answer.legend as Record<string, unknown>)) {
      legend[key] = typeof label === "string" ? label : JSON.stringify(label);
    }
    return {
      type: "score",
      score: answer.score,
      confidence: answer.confidence,
      legend,
      probabilities: numberMap(answer.probabilities),
    };
  }
  throw new Error(`Answer "${id}" did not match a noul, choice, or score.`);
}

function numberMap(value: object): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
  }
  return out;
}

export function readNoul(answers: Record<string, Answer>, id: string): number {
  const answer = answers[id];
  if (!answer || answer.type !== "noul") {
    throw new Error(`Expected a noul answer for "${id}".`);
  }
  return (answer as NoulAnswer).noul;
}

export function readChoice(answers: Record<string, Answer>, id: string): ChoiceAnswer {
  const answer = answers[id];
  if (!answer || answer.type !== "choice") {
    throw new Error(`Expected a choice answer for "${id}".`);
  }
  return answer;
}

export function readScore(answers: Record<string, Answer>, id: string): ScoreAnswer {
  const answer = answers[id];
  if (!answer || answer.type !== "score") {
    throw new Error(`Expected a score answer for "${id}".`);
  }
  return answer;
}

export function legendEntries(legend: Record<string, string>): { level: number; label: string }[] {
  return Object.entries(legend)
    .map(([key, label]) => ({ level: Number(key), label }))
    .filter((entry) => Number.isFinite(entry.level))
    .sort((a, b) => a.level - b.level);
}

export function scoreUnit(answer: ScoreAnswer): number {
  const levels = legendEntries(answer.legend);
  const max = levels.length > 1 ? levels[levels.length - 1].level : 1;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, answer.score / max));
}

export function sortedProbabilities(probabilities: Record<string, number>): { key: string; p: number }[] {
  return Object.entries(probabilities)
    .map(([key, p]) => ({ key, p }))
    .sort((a, b) => b.p - a.p);
}
