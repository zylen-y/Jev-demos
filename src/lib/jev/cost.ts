import { INPUT_USD_PER_MILLION, OUTPUT_USD_PER_MILLION } from "./types";
import type { Usage } from "./types";

export function costUsd(usage: Usage): number | null {
  if (usage.input_tokens == null || usage.output_tokens == null) return null;
  if (!Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return null;
  return (
    (usage.input_tokens * INPUT_USD_PER_MILLION + usage.output_tokens * OUTPUT_USD_PER_MILLION) /
    1_000_000
  );
}

/** Rough pre-call estimate. Actual cost uses `usage.input_tokens` from the response. */
export function estimateTokens(value: unknown): number {
  const chars = JSON.stringify(value)?.length ?? 0;
  return Math.max(1, Math.ceil(chars / 4));
}

export function estimateCostUsd(tokens: number): number {
  return (tokens * INPUT_USD_PER_MILLION) / 1_000_000;
}

export function formatUsd(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  if (amount === 0) return "$0";
  if (amount < 0.0001) return `$${amount.toFixed(6)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
