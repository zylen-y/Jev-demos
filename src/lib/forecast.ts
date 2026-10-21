import { clamp } from "./format";

export type ForecastSignals = {
  intent: number;
  urgency: number;
  interest: number;
  supply: number;
  competition: number;
};

export function seasonalForecast(series: number[], horizon: number, period = 4, alpha = 0.45): number[] {
  if (series.length === 0 || horizon <= 0) return [];
  let level = series[0];
  for (const point of series) level = alpha * point + (1 - alpha) * level;
  const factors = seasonalFactors(series, period);
  const start = series.length;
  return Array.from({ length: horizon }, (_, step) => {
    const factor = factors[(start + step) % period] ?? 1;
    return Math.max(0, level * factor);
  });
}

export function seasonalFactors(series: number[], period: number): number[] {
  const safePeriod = Math.max(1, period);
  const buckets = Array.from({ length: safePeriod }, () => [] as number[]);
  series.forEach((value, index) => buckets[index % safePeriod].push(value));
  const means = buckets.map((bucket) =>
    bucket.length ? bucket.reduce((sum, value) => sum + value, 0) / bucket.length : 1,
  );
  const global = means.reduce((sum, value) => sum + value, 0) / means.length || 1;
  return means.map((value) => value / global);
}

/**
 * Code-owned adjustment. Semantic signals move a classical forecast;
 * they do not replace the time series.
 */
export function semanticMultiplier(signals: ForecastSignals): number {
  const raw =
    1 +
    0.18 * (signals.intent - 0.5) * 2 +
    0.08 * (signals.urgency - 0.5) * 2 +
    0.1 * (signals.interest - 0.5) * 2 -
    0.14 * signals.supply -
    0.1 * signals.competition;
  return clamp(raw, 0.7, 1.35);
}

export function applyMultiplier(forecast: number[], multiplier: number): number[] {
  return forecast.map((value) => Math.max(0, value * multiplier));
}
