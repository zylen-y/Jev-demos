import { describe, expect, it } from "vitest";
import { modelTimeFromHeaders } from "../jev/client";
import { formatRelayCents, formatRelayUsd, percentile, summarizeRelay } from "./stats";

describe("relay stats", () => {
  it("ranks percentiles from measured samples only", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([40, 10, 30, 20], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40, 200], 95)).toBe(200);
  });

  it("sums reported token cost and leaves missing usage unpriced", () => {
    const summary = summarizeRelay([
      { roundTripMs: 180, upstreamMs: 140, costUsd: 0.00002, inputTokens: 500 },
      { roundTripMs: 220, upstreamMs: 160, costUsd: 0.00003, inputTokens: 700 },
      { roundTripMs: 900, upstreamMs: null, costUsd: null, inputTokens: null },
    ]);
    expect(summary.decisions).toBe(3);
    expect(summary.p50RoundTripMs).toBe(220);
    expect(summary.spendUsd).toBeCloseTo(0.00005);
    expect(summary.inputTokens).toBe(1200);
    expect(summary.unpriced).toBe(1);
    expect(summary.p50UpstreamMs).toBe(140);
    expect(formatRelayUsd(summary.spendUsd)).toBe("$0.00005");
    expect(formatRelayCents(0.04303)).toBe("$0.04");
    expect(formatRelayCents(0.0867)).toBe("$0.09");
  });
});

describe("model timing headers", () => {
  it("reads a model duration and ignores unrelated server-timing metrics", () => {
    const headers = new Headers({ "server-timing": "total;dur=400, model;dur=142.5" });
    expect(modelTimeFromHeaders(headers)).toBeCloseTo(142.5);
    expect(modelTimeFromHeaders(new Headers({ "server-timing": "app;dur=20" }))).toBeNull();
  });
});
