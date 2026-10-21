import { operationDemos } from "./operations";
import { platformDemos } from "./platform";
import type { CaseDemoConfig } from "./types";

export const caseDemos: CaseDemoConfig[] = [...platformDemos, ...operationDemos];

export const SPECIAL_SLUGS = [
  "realtime",
  "map-reduce",
  "search",
  "semantic-lint",
  "feature-extraction",
  "demand-forecasting",
  "knowledge-graph",
] as const;

export function getCaseDemo(slug: string): CaseDemoConfig | undefined {
  return caseDemos.find((demo) => demo.slug === slug);
}
