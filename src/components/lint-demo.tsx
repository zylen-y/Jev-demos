"use client";

import { useState } from "react";
import { CODE_RULES, PROSE_RULES, buildLintRequest, interpretLint, type Finding } from "@/lib/lint/rules";
import { useJev } from "./use-jev";
import { CallStrip, ErrorNote, MissingKeyNote } from "./viz";

const SAMPLES = [
  {
    id: "code",
    filename: "examples/lint-target.ts",
    source: `export function getBalance(accountId: string) {
  // TODO: handle the missing account
  try {
    return chargeCard(accountId, 40);
  } catch {
    return 0;
  }
}

const apiKey = "sk_live_51NorthlineDemoKey";

function chargeCard(_accountId: string, _amount: number) {
  return 0;
}
`,
  },
  {
    id: "prose",
    filename: "notes/launch.md",
    source: `# Revolutionary checkout

This flow is always seamless and guaranteed to convert 40% better.

Customers will love it.
`,
  },
  {
    id: "clean",
    filename: "examples/clean-module.ts",
    source: `export function readBalance(accountId: string): number {
  if (!accountId) throw new Error("accountId is required");
  return loadBalance(accountId);
}

function loadBalance(_accountId: string): number {
  return 0;
}
`,
  },
];

export function LintDemo() {
  const jev = useJev();
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const sample = SAMPLES.find((item) => item.id === sampleId) ?? SAMPLES[0];
  const [filename, setFilename] = useState(sample.filename);
  const [source, setSource] = useState(sample.source);
  const [threshold, setThreshold] = useState(0.6);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const rules = filename.endsWith(".md") ? PROSE_RULES : CODE_RULES;
  const lines = source.split(/\r?\n/);

  function load(id: string) {
    const next = SAMPLES.find((item) => item.id === id);
    if (!next) return;
    setSampleId(id);
    setFilename(next.filename);
    setSource(next.source);
    setFindings(null);
    jev.clear();
  }

  async function run() {
    const response = await jev.run(buildLintRequest(filename, source), { label: "lint" });
    setFindings(interpretLint(filename, source, response.answers, threshold));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((item) => (
            <button className={item.id === sampleId ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper" : "rounded-full border border-line px-3 py-1.5 text-sm"} key={item.id} onClick={() => load(item.id)} type="button">
              {item.filename}
            </button>
          ))}
        </div>
        <label className="block text-sm">
          Filename
          <input className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2" onChange={(event) => setFilename(event.target.value)} value={filename} />
        </label>
        <label className="block text-sm">
          Source
          <textarea className="mono mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3 text-xs leading-5" onChange={(event) => setSource(event.target.value)} rows={16} value={source} />
        </label>
        <label className="block text-sm">
          Finding threshold {threshold.toFixed(2)}
          <input className="mt-1 w-full accent-vermilion" max={0.9} min={0.3} onChange={(event) => setThreshold(Number(event.target.value))} step={0.01} type="range" value={threshold} />
        </label>
        <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending} onClick={() => run().catch(() => undefined)} type="button">
          {jev.pending ? "Linting…" : "Run semantic lint"}
        </button>
        <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
        <ErrorNote message={jev.error} />
        <div className="rounded-2xl border border-line bg-card p-4 text-sm leading-6">
          <p className="font-medium">Same check, three places</p>
          <p className="mt-2 text-muted">The UI, <span className="mono text-ink">npx tsx cli/semantic-lint.ts</span>, and <span className="mono text-ink">.github/actions/jev-semantic-lint</span> share <span className="mono text-ink">buildLintRequest</span>.</p>
          <pre className="mono mt-3 overflow-auto text-xs">{`TYPESAFE_API_KEY=... npx tsx cli/semantic-lint.ts examples/lint-target.ts`}</pre>
        </div>
      </section>
      <section className="space-y-4">
        <CallStrip calls={jev.calls} pending={jev.pending} />
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="text-sm text-muted">{filename.endsWith(".md") ? "Writing guidelines" : "Coding conventions"}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {rules.map((rule) => (
              <li key={rule.id}>{rule.title}</li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-3xl border border-line bg-ink text-paper">
          <ol className="mono max-h-[28rem] overflow-auto text-xs leading-6">
            {lines.map((line, index) => {
              const hit = findings?.find((finding) => finding.line === index + 1);
              return (
                <li className={hit ? "bg-vermilion/30 px-3" : "px-3"} key={`${index}-${line}`}>
                  <span className="mr-3 inline-block w-6 text-paper/40">{index + 1}</span>
                  {line || " "}
                </li>
              );
            })}
          </ol>
        </div>
        {findings ? (
          findings.length === 0 ? (
            <p className="text-sm">No finding at or above {threshold.toFixed(2)}.</p>
          ) : (
            <ul className="space-y-2">
              {findings.map((finding) => (
                <li className="rounded-2xl border border-line bg-card px-4 py-3 text-sm" key={`${finding.rule}-${finding.line}`}>
                  <span className="mono text-xs text-vermilion">
                    {finding.file}:{finding.line ?? "file"} · {(finding.probability * 100).toFixed(0)}%
                  </span>
                  <p>{finding.message}</p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-muted">Line choice questions point at a numbered line, the same shape as the line-by-line search cookbook. A noul decides whether the rule is present at all.</p>
        )}
      </section>
    </div>
  );
}
