"use client";

import { useMemo, useState } from "react";
import { estimateCostUsd, estimateTokens, formatUsd } from "@/lib/jev/cost";
import { JevCallError } from "@/lib/jev/errors";
import type { Answer, Question } from "@/lib/jev/types";
import { thresholdDefaults, type CaseDemoConfig, type DecisionView } from "@/lib/demos/types";
import { useJev } from "./use-jev";
import { ActionPlot, CallStrip, ErrorNote, MiniGraphView, MissingKeyNote, RankedList, TonePill, VizList, WorkflowRail } from "./viz";

export function CaseDemo({ config }: { config: CaseDemoConfig }) {
  const jev = useJev();
  const [sampleId, setSampleId] = useState(config.samples[0]?.id ?? "");
  const sample = config.samples.find((item) => item.id === sampleId) ?? config.samples[0];
  const [fields, setFields] = useState<Record<string, string>>(sample?.fields ?? {});
  const [thresholds, setThresholds] = useState<Record<string, number>>(() => thresholdDefaults(config));
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function selectSample(id: string) {
    const next = config.samples.find((item) => item.id === id);
    if (!next) return;
    setSampleId(id);
    setFields(next.fields);
    setAnswers(null);
    setLocalError(null);
    jev.clear();
  }

  const built = useMemo(() => {
    try {
      return { request: config.request(fields), error: null as string | null };
    } catch (error) {
      return { request: null, error: error instanceof Error ? error.message : "Could not build the request." };
    }
  }, [config, fields]);

  const view: DecisionView | null = useMemo(() => {
    if (!answers || !built.request) return null;
    try {
      return config.decide(answers, fields, thresholds);
    } catch (error) {
      return {
        headline: "Could not read the answers",
        tone: "stop",
        summary: error instanceof Error ? error.message : "The response was missing a question this demo expects.",
        groups: [],
      };
    }
  }, [answers, built.request, config, fields, thresholds]);

  async function run() {
    if (!built.request) {
      setLocalError(built.error);
      return;
    }
    setLocalError(null);
    try {
      const response = await jev.run(built.request, { label: config.slug });
      setAnswers(response.answers);
    } catch (error) {
      if (error instanceof JevCallError && error.status === 401 && error.message.includes("Add a Jev")) return;
      setAnswers(null);
    }
  }

  const plan = built.request ? Object.entries(built.request.questions).map(([id, question]) => ({ id, ...describe(question) })) : [];
  const estimate = built.request ? estimateTokens(built.request) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {config.samples.map((item) => (
            <button
              aria-pressed={item.id === sampleId}
              className={item.id === sampleId ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper" : "rounded-full border border-line bg-card px-3 py-1.5 text-sm"}
              key={item.id}
              onClick={() => selectSample(item.id)}
              type="button"
            >
              {item.title}
            </button>
          ))}
        </div>
        {sample ? <p className="text-sm text-muted">{sample.blurb}</p> : null}
        <p className="text-sm text-muted">{config.stateNote}</p>
        {config.fields.map((field) => (
          <label className="block" key={field.key}>
            <span className="text-sm">{field.label}</span>
            <textarea
              className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3 text-sm leading-6"
              onChange={(event) => {
                setFields((current) => ({ ...current, [field.key]: event.target.value }));
                setAnswers(null);
              }}
              rows={field.rows ?? 4}
              value={fields[field.key] ?? ""}
            />
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending || !built.request} onClick={run} type="button">
            {jev.pending ? "Asking Jev…" : jev.apiKey ? "Run live" : "Add a key to run"}
          </button>
          <p className="mono text-xs text-muted">
            Estimate {estimate} tokens · {formatUsd(estimateCostUsd(estimate))} before the call
          </p>
        </div>
        <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
        <ErrorNote message={localError || built.error || jev.error} />
        {config.thresholds ? (
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="text-sm">Thresholds live in code. Move them and the branch updates without another call.</p>
            <div className="mt-3 space-y-3">
              {config.thresholds.map((threshold) => (
                <label className="block text-sm" key={threshold.key}>
                  <span className="flex justify-between gap-3">
                    {threshold.label}
                    <span className="mono text-xs">{(thresholds[threshold.key] ?? threshold.default).toFixed(2)}</span>
                  </span>
                  <input
                    className="mt-1 w-full accent-vermilion"
                    max={threshold.max}
                    min={threshold.min}
                    onChange={(event) => setThresholds((current) => ({ ...current, [threshold.key]: Number(event.target.value) }))}
                    step={threshold.step}
                    type="range"
                    value={thresholds[threshold.key] ?? threshold.default}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <section aria-live="polite" className="space-y-4">
        <CallStrip calls={jev.calls} pending={jev.pending} />
        {view ? (
          <div className="rise rounded-3xl border border-line bg-card p-5">
            <TonePill tone={view.tone}>{view.tone}</TonePill>
            <h2 className="serif mt-3 text-4xl leading-none">{view.headline}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{view.summary}</p>
            {view.steps ? (
              <div className="mt-5">
                <WorkflowRail steps={view.steps} />
              </div>
            ) : null}
            {view.ranked ? (
              <div className="mt-5">
                <RankedList items={view.ranked} />
              </div>
            ) : null}
            {view.plot ? (
              <div className="mt-5">
                <ActionPlot {...view.plot} />
              </div>
            ) : null}
            {view.graph ? (
              <div className="mt-5">
                <MiniGraphView graph={view.graph} />
              </div>
            ) : null}
            <div className="mt-6 space-y-6">
              {view.groups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-sm uppercase tracking-[0.16em] text-muted">{group.title}</h3>
                  <div className="mt-3">
                    <VizList items={group.items} />
                  </div>
                </div>
              ))}
            </div>
            <details className="mt-6">
              <summary className="cursor-pointer text-sm">Raw answers</summary>
              <pre className="mono mt-3 max-h-80 overflow-auto rounded-2xl bg-ink p-4 text-xs text-paper">{JSON.stringify(answers, null, 2)}</pre>
            </details>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-line bg-card/70 p-5">
            <p className="serif text-3xl">Questions in this call</p>
            <p className="mt-2 text-sm text-muted">Nothing has been sent. This is the fan-out the button will run.</p>
            <ul className="mt-4 space-y-3">
              {plan.map((item) => (
                <li key={item.id}>
                  <p className="mono text-[11px] uppercase tracking-[0.14em] text-vermilion">
                    {item.type} · {item.id}
                  </p>
                  <p className="text-sm leading-6">{item.instructions}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function describe(question: Question): { type: string; instructions: string } {
  const instructions = "instructions" in question && question.instructions ? question.instructions : "No instruction text.";
  return { type: question.type, instructions };
}
