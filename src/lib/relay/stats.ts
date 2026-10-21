export type RelaySample = {
  roundTripMs: number;
  upstreamMs: number | null;
  costUsd: number | null;
  inputTokens: number | null;
};

export type RelaySummary = {
  decisions: number;
  p50RoundTripMs: number | null;
  p95RoundTripMs: number | null;
  p50UpstreamMs: number | null;
  p95UpstreamMs: number | null;
  spendUsd: number;
  inputTokens: number;
  unpriced: number;
};

/** Nearest-rank percentile. `p` is 0–100. Empty input returns null. */
export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? null;
}

export function summarizeRelay(rows: readonly RelaySample[]): RelaySummary {
  const round = rows.map((row) => row.roundTripMs);
  const upstream = rows.flatMap((row) => (row.upstreamMs == null ? [] : [row.upstreamMs]));
  const priced = rows.filter((row) => row.costUsd != null && Number.isFinite(row.costUsd));
  return {
    decisions: rows.length,
    p50RoundTripMs: percentile(round, 50),
    p95RoundTripMs: percentile(round, 95),
    p50UpstreamMs: percentile(upstream, 50),
    p95UpstreamMs: percentile(upstream, 95),
    spendUsd: priced.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
    inputTokens: priced.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
    unpriced: rows.length - priced.length,
  };
}

/** Five decimal places so a sub-cent total can still tick. The amount is the summed API cost. */
export function formatRelayUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `$${amount.toFixed(5)}`;
}
