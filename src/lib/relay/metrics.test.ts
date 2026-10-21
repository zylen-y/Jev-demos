import { describe, expect, it } from "vitest";
import { redactSecret } from "../jev/errors";
import { measuredRecording, metricDataAttributes, readingFromAttributes, spendFromSummary } from "./metrics";

describe("recording metrics", () => {
  it("round-trips the measured numbers and leaves a mock pass unpriced", () => {
    const attributes = metricDataAttributes({
      mock: true,
      burstSize: 2400,
      burstDurationMs: 3.26,
      p50LatencyMs: null,
      p95LatencyMs: null,
      spendUsd: null,
    });
    const reading = readingFromAttributes({
      mock: attributes["data-mock"] ?? null,
      burstSize: attributes["data-burst-size"] ?? null,
      burstDurationMs: attributes["data-burst-duration-ms"] ?? null,
      p50LatencyMs: attributes["data-p50-ms"] ?? null,
      p95LatencyMs: attributes["data-p95-ms"] ?? null,
      spendUsd: attributes["data-spend-usd"] ?? null,
    });
    const report = measuredRecording("relay", reading, "local");
    expect(report).toEqual({
      source: "relay",
      mock: true,
      burstSize: 2400,
      burstDurationMs: 3.3,
      p50LatencyMs: null,
      p95LatencyMs: null,
      spendUsd: null,
      note: "local",
    });
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("keeps a reported spend and drops an unpriced batch", () => {
    expect(
      spendFromSummary({
        decisions: 2,
        p50RoundTripMs: 10,
        p95RoundTripMs: 20,
        p50UpstreamMs: null,
        p95UpstreamMs: null,
        spendUsd: 0.000021,
        inputTokens: 500,
        unpriced: 0,
      }),
    ).toBeCloseTo(0.000021);
    expect(
      spendFromSummary({
        decisions: 2,
        p50RoundTripMs: null,
        p95RoundTripMs: null,
        p50UpstreamMs: null,
        p95UpstreamMs: null,
        spendUsd: 0,
        inputTokens: 0,
        unpriced: 2,
      }),
    ).toBeNull();
  });

  it("redacts a key from recorder logs", () => {
    const secret = "ts_canary_do_not_leak_9999";
    expect(redactSecret(`failed with ${secret} in the text`, secret)).toBe("failed with [redacted] in the text");
    expect(redactSecret(`failed with ${secret} in the text`, secret)).not.toContain(secret);
  });
});