import type { RelaySummary } from "./stats";

export type MeasuredRecording = {
  source: "relay" | "walkthrough";
  mock: boolean;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  burstSize: number | null;
  burstDurationMs: number | null;
  spendUsd: number | null;
  note: string;
};

export type MetricReading = {
  mock: boolean;
  burstSize: number | null;
  burstDurationMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  spendUsd: number | null;
};

export function spendFromSummary(summary: RelaySummary): number | null {
  if (summary.decisions === 0 || summary.unpriced === summary.decisions) return null;
  return summary.spendUsd;
}

export function metricDataAttributes(reading: MetricReading): Record<string, string> {
  return {
    "data-mock": reading.mock ? "1" : "0",
    "data-burst-size": reading.burstSize == null ? "" : String(reading.burstSize),
    "data-burst-duration-ms": measure(reading.burstDurationMs),
    "data-p50-ms": measure(reading.p50LatencyMs),
    "data-p95-ms": measure(reading.p95LatencyMs),
    "data-spend-usd": spend(reading.spendUsd),
  };
}

export function readingFromAttributes(attributes: {
  mock: string | null;
  burstSize: string | null;
  burstDurationMs: string | null;
  p50LatencyMs: string | null;
  p95LatencyMs: string | null;
  spendUsd: string | null;
}): MetricReading {
  return {
    mock: attributes.mock === "1",
    burstSize: count(attributes.burstSize),
    burstDurationMs: parseMeasure(attributes.burstDurationMs),
    p50LatencyMs: parseMeasure(attributes.p50LatencyMs),
    p95LatencyMs: parseMeasure(attributes.p95LatencyMs),
    spendUsd: parseMeasure(attributes.spendUsd),
  };
}

export function measuredRecording(
  source: MeasuredRecording["source"],
  reading: MetricReading,
  note: string,
): MeasuredRecording {
  return {
    source,
    mock: reading.mock,
    p50LatencyMs: reading.p50LatencyMs,
    p95LatencyMs: reading.p95LatencyMs,
    burstSize: reading.burstSize,
    burstDurationMs: reading.burstDurationMs,
    spendUsd: reading.spendUsd,
    note,
  };
}

function measure(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 10) / 10);
}

function spend(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 1e8) / 1e8);
}

function parseMeasure(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function count(value: string | null): number | null {
  const parsed = parseMeasure(value);
  if (parsed == null) return null;
  return Math.round(parsed);
}
