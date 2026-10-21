import type { Question, SystemOneRequest } from "./types";
import { JEV_MODEL } from "./types";

export type Validation =
  | { ok: true; request: SystemOneRequest }
  | { ok: false; message: string };

const QUESTION_TYPES = new Set(["noul", "choice", "score"]);

export function validateSystemOneBody(body: unknown): Validation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;
  if ("assets" in record && record.assets != null) {
    return {
      ok: false,
      message:
        "This demo proxy forwards text System One requests. Image assets are documented, and these demos do not send them.",
    };
  }
  if (!isState(record.state)) {
    return { ok: false, message: "State must be a string, object, or array." };
  }
  if (record.model != null && typeof record.model !== "string") {
    return { ok: false, message: "Model must be a string." };
  }
  if (!record.questions || typeof record.questions !== "object" || Array.isArray(record.questions)) {
    return { ok: false, message: "Questions must be a non-empty object." };
  }
  const questions: Record<string, Question> = {};
  const entries = Object.entries(record.questions as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, message: "Ask at least one question." };
  }
  for (const [id, value] of entries) {
    const parsed = parseQuestion(id, value);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    questions[id] = parsed;
  }
  return {
    ok: true,
    request: {
      model: typeof record.model === "string" && record.model.trim() ? record.model : JEV_MODEL,
      state: record.state as SystemOneRequest["state"],
      questions,
    },
  };
}

function isState(value: unknown): boolean {
  if (typeof value === "string") return true;
  if (Array.isArray(value)) return true;
  return Boolean(value) && typeof value === "object";
}

function parseQuestion(id: string, value: unknown): Question | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `Question "${id}" must be an object.`;
  }
  const question = value as Record<string, unknown>;
  if (question.type === "box") {
    return "Box questions are documented for images. These demos ask choice, score, and noul questions.";
  }
  if (typeof question.type !== "string" || !QUESTION_TYPES.has(question.type)) {
    return `Question "${id}" has an unknown type.`;
  }
  const instructions = question.instructions;
  if (
    instructions != null &&
    typeof instructions !== "string" &&
    (typeof instructions !== "object" || instructions === null)
  ) {
    return `Question "${id}" has invalid instructions.`;
  }
  if (question.type === "noul") {
    return {
      type: "noul",
      ...(typeof instructions === "string" ? { instructions } : {}),
      ...(question.criteria && typeof question.criteria === "object"
        ? { criteria: question.criteria as { true?: string; false?: string } }
        : {}),
    };
  }
  if (question.type === "choice") {
    if (!question.criteria || typeof question.criteria !== "object" || Array.isArray(question.criteria)) {
      return `Choice "${id}" needs a criteria map.`;
    }
    const criteria = question.criteria as Record<string, string | null>;
    if (Object.keys(criteria).length === 0) {
      return `Choice "${id}" needs at least one option.`;
    }
    return {
      type: "choice",
      ...(typeof instructions === "string" ? { instructions } : {}),
      criteria,
    };
  }
  if (!Array.isArray(question.criteria) || question.criteria.length < 2) {
    return `Score "${id}" needs at least two rubric levels.`;
  }
  if (!question.criteria.every((level) => typeof level === "string")) {
    return `Score "${id}" levels must be strings in this demo.`;
  }
  return {
    type: "score",
    ...(typeof instructions === "string" ? { instructions } : {}),
    criteria: question.criteria,
  };
}
