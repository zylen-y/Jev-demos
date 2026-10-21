import type { ChoiceQuestion, NoulQuestion, Question, QuestionEntry, SystemOneRequest } from "./types";
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
  const instructions = copyEntry(question.instructions);
  if (question.instructions != null && instructions === undefined) {
    return `Question "${id}" has invalid instructions.`;
  }
  if (question.type === "noul") {
    const criteria = copyNoulCriteria(question.criteria);
    if (question.criteria != null && criteria === undefined) {
      return `Noul "${id}" has invalid criteria.`;
    }
    const parsed: NoulQuestion = { type: "noul" };
    if (instructions !== undefined) parsed.instructions = instructions;
    if (criteria) parsed.criteria = criteria;
    return parsed;
  }
  if (question.type === "choice") {
    const criteria = copyChoiceCriteria(id, question.criteria);
    if (typeof criteria === "string") return criteria;
    const parsed: ChoiceQuestion = { type: "choice", criteria };
    if (instructions !== undefined) parsed.instructions = instructions;
    return parsed;
  }
  if (!Array.isArray(question.criteria) || question.criteria.length < 2) {
    return `Score "${id}" needs at least two rubric levels.`;
  }
  if (!question.criteria.every((level) => typeof level === "string")) {
    return `Score "${id}" levels must be strings in this demo.`;
  }
  return {
    type: "score",
    ...(instructions !== undefined ? { instructions } : {}),
    criteria: question.criteria,
  };
}

function copyEntry(value: unknown): QuestionEntry | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
}

function copyNoulCriteria(value: unknown): NoulQuestion["criteria"] | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const criteria: NonNullable<NoulQuestion["criteria"]> = {};
  if ("true" in record) {
    const entry = copyEntry(record.true);
    if (record.true != null && entry === undefined) return undefined;
    if (entry !== undefined) criteria.true = entry;
  }
  if ("false" in record) {
    const entry = copyEntry(record.false);
    if (record.false != null && entry === undefined) return undefined;
    if (entry !== undefined) criteria.false = entry;
  }
  return criteria;
}

function copyChoiceCriteria(id: string, value: unknown): ChoiceQuestion["criteria"] | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `Choice "${id}" needs a criteria map.`;
  }
  const criteria: ChoiceQuestion["criteria"] = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null) {
      criteria[key] = null;
      continue;
    }
    const entry = copyEntry(item);
    if (entry === undefined) return `Choice "${id}" option "${key}" must be text or JSON.`;
    criteria[key] = entry;
  }
  if (Object.keys(criteria).length === 0) return `Choice "${id}" needs at least one option.`;
  return criteria;
}
