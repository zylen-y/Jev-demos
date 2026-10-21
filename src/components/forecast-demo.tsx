"use client";

import { useState } from "react";
import { FORECAST_NOTES, WEEKLY_DEMAND, forecastRequest } from "@/lib/demos/forecast-data";
import { applyMultiplier, seasonalForecast, semanticMultiplier } from "@/lib/forecast";
import { formatPct } from "@/lib/format";
import { readChoice, readNoul, readScore, scoreUnit } from "@/lib/jev/parse";
import { useJev } from "./use-jev";
import { CallStrip, ErrorNote, MissingKeyNote, NoulMeter } from "./viz";

export function ForecastDemo() {
  const jev = useJev();
  const [notes, setNotes] = useState(FORECAST_NOTES);
  const [result, setResult] = useState<{
    baseline: number[];
    adjusted: number[];
    multiplier: number;
    intent: number;
    urgency: number;
    interest: number;
    supply: number;
    competition: number;
    theme: string;
  } | null>(null);
  const horizon = 4;
  const baselinePreview = seasonalForecast(WEEKLY_DEMAND, horizon);

  async function run() {
    const response = await jev.run(forecastRequestFrom(notes), { label: "forecast" });
    const signals = {
      intent: readNoul(response.answers, "purchase_intent"),
      urgency: readNoul(response.answers, "urgency"),
      interest: scoreUnit(readScore(response.answers, "interest")),
      supply: readNoul(response.answers, "supply"),
      competition: readNoul(response.answers, "competition"),
    };
    const multiplier = semanticMultiplier(signals);
    const baseline = seasonalForecast(WEEKLY_DEMAND, horizon);
    setResult({
      ...signals,
      theme: readChoice(response.answers, "theme").choice,
      multiplier,
      baseline,
      adjusted: applyMultiplier(baseline, multiplier),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="space-y-3">
        <p className="text-sm text-muted">Sixteen weeks of units stay a time series. The notes are the semantic layer.</p>
        {(Object.keys(notes) as (keyof typeof notes)[]).map((key) => (
          <label className="block text-sm capitalize" key={key}>
            {key}
            <textarea
              className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2"
              onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
              rows={3}
              value={notes[key]}
            />
          </label>
        ))}
        <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending} onClick={() => run().catch(() => undefined)} type="button">
          {jev.pending ? "Reading the notes…" : "Adjust the forecast"}
        </button>
        <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
        <ErrorNote message={jev.error} />
      </section>
      <section className="space-y-4">
        <CallStrip calls={jev.calls} pending={jev.pending} />
        <ForecastChart adjusted={result?.adjusted ?? null} baseline={result?.baseline ?? baselinePreview} history={WEEKLY_DEMAND} />
        {result ? (
          <div className="rounded-3xl border border-line bg-card p-5">
            <p className="serif text-3xl">Multiplier {result.multiplier.toFixed(2)}</p>
            <p className="mt-2 text-sm text-muted">Theme: {result.theme}. The multiplier is a fixed formula of the five signals, clamped between 0.70 and 1.35.</p>
            <div className="mt-4 space-y-3">
              <NoulMeter label="Purchase intent" p={result.intent} />
              <NoulMeter label="Urgency" p={result.urgency} />
              <NoulMeter label="Product interest" p={result.interest} />
              <NoulMeter label="Supply concern" p={result.supply} />
              <NoulMeter label="Competitive pressure" p={result.competition} />
            </div>
            <p className="mono mt-4 text-xs text-muted">
              Next week {result.baseline[0].toFixed(0)} → {result.adjusted[0].toFixed(0)} ({formatPct(result.multiplier - 1, 0)})
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">The dashed line is the seasonal forecast with no semantic adjustment. Run the notes to draw the second line.</p>
        )}
      </section>
    </div>
  );
}

function forecastRequestFrom(notes: typeof FORECAST_NOTES) {
  const built = forecastRequest();
  return { ...built, state: notes };
}

function ForecastChart({ history, baseline, adjusted }: { history: number[]; baseline: number[]; adjusted: number[] | null }) {
  const series = [...history, ...baseline];
  const max = Math.max(...series, ...(adjusted ?? [])) * 1.15;
  const width = 640;
  const height = 260;
  const pad = 28;
  const step = (width - pad * 2) / (history.length + baseline.length - 1);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const historyPath = history.map((value, index) => `${index === 0 ? "M" : "L"} ${pad + index * step} ${y(value)}`).join(" ");
  const future = (values: number[]) => [history[history.length - 1], ...values].map((value, index) => `${index === 0 ? "M" : "L"} ${pad + (history.length - 1 + index) * step} ${y(value)}`).join(" ");
  return (
    <svg className="h-auto w-full rounded-3xl border border-line bg-card" role="img" viewBox={`0 0 ${width} ${height}`}>
      <text fill="#5f5a50" fontSize="11" x={pad} y={18}>
        Weekly units
      </text>
      <path d={historyPath} fill="none" stroke="#17160f" strokeWidth="2" />
      <path d={future(baseline)} fill="none" stroke="#8a5608" strokeDasharray="4 4" strokeWidth="2" />
      {adjusted ? <path d={future(adjusted)} fill="none" stroke="#e23b16" strokeWidth="2.4" /> : null}
    </svg>
  );
}
