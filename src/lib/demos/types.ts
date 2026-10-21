import type { Step, Tone } from "../decisions";
import type { Answer, SystemOneRequest } from "../jev/types";

export type VizItem =
  | { kind: "noul"; label: string; p: number; caption?: string }
  | {
      kind: "choice";
      label: string;
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
      caption?: string;
    }
  | {
      kind: "score";
      label: string;
      score: number;
      confidence: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      caption?: string;
    }
  | { kind: "field"; label: string; value: string; detail?: string }
  | { kind: "meter"; label: string; value: number; caption?: string };

export type ViewGroup = {
  title: string;
  items: VizItem[];
};

export type MiniGraph = {
  nodes: { id: string; label: string; kind?: string }[];
  edges: { source: string; target: string; label: string; p: number }[];
};

export type DecisionView = {
  headline: string;
  tone: Tone;
  summary: string;
  steps?: Step[];
  groups: ViewGroup[];
  graph?: MiniGraph;
  ranked?: { id: string; title: string; score: number; detail: string }[];
  plot?: { xLabel: string; yLabel: string; x: number; y: number; action: string };
};

export type DemoField = {
  key: string;
  label: string;
  rows?: number;
};

export type DemoSample = {
  id: string;
  title: string;
  blurb: string;
  fields: Record<string, string>;
};

export type ThresholdSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

export type CaseDemoConfig = {
  slug: string;
  stateNote: string;
  fields: DemoField[];
  samples: DemoSample[];
  thresholds?: ThresholdSpec[];
  request: (fields: Record<string, string>) => SystemOneRequest;
  decide: (answers: Record<string, Answer>, fields: Record<string, string>, thresholds: Record<string, number>) => DecisionView;
};

export function thresholdDefaults(config: CaseDemoConfig): Record<string, number> {
  const values: Record<string, number> = {};
  for (const threshold of config.thresholds ?? []) values[threshold.key] = threshold.default;
  return values;
}
