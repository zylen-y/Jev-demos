/** Documented System One shapes. See https://docs.typesafe.ai/api/system-one */

export const JEV_MODEL = "jev-latest";
export const SYSTEM_ONE_PATH = "/v1/systemone";
export const MODELS_PATH = "/v1/models";
export const DEFAULT_BASE_URL = "https://api.typesafe.ai";

/** Published input price for Jev 1.13 and Jev 1.14. Output tokens are free. */
export const INPUT_USD_PER_MILLION = 0.042;
export const OUTPUT_USD_PER_MILLION = 0;

/** Model-time figure used as a visual reference. Round trip includes network and the proxy. */
export const MODEL_TARGET_MS = 150;

/** Text or JSON, matching the System One entry type for instructions and criteria. */
export type QuestionEntry = string | Record<string, unknown> | unknown[];

export type NoulQuestion = {
  type: "noul";
  instructions?: QuestionEntry;
  criteria?: { true?: QuestionEntry; false?: QuestionEntry } | null;
};

export type ChoiceQuestion = {
  type: "choice";
  instructions?: QuestionEntry;
  criteria: Record<string, QuestionEntry | null>;
};

export type ScoreQuestion = {
  type: "score";
  instructions?: QuestionEntry;
  criteria: string[];
};

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type SystemOneRequest = {
  model: string;
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, Question>;
};

export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
};

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type Usage = {
  input_tokens: number | null;
  output_tokens: number | null;
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage: Usage;
};

export type ModelCard = {
  name: string;
  description: string;
  release_date: string;
};
