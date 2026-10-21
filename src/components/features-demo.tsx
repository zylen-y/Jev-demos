"use client";

import { useState } from "react";
import { FEATURE_BANK, REVIEWS, featureRequest, type ReviewRow } from "@/lib/demos/features-data";
import { formatPct } from "@/lib/format";
import { binaryMetrics, forwardSelect, lift, majorityProbability, predictProbability, splitIndexes, trainLogistic } from "@/lib/ml";
import { readNoul } from "@/lib/jev/parse";
import { mapPool } from "@/lib/pool";
import { useJev } from "./use-jev";
import { CallStrip, ErrorNote, MissingKeyNote } from "./viz";

type Trained = {
  accuracy: number;
  baseline: number;
  keyword: number;
  structuredOnly: number;
  auc: number;
  logLoss: number;
  liftPoints: number;
  coefficients: { name: string; weight: number }[];
  trail: { features: string[]; testLogLoss: number; testAccuracy: number }[];
  holdout: { id: string; y: number; p: number; text: string }[];
};

export function FeaturesDemo() {
  const jev = useJev();
  const [count, setCount] = useState(12);
  const [custom, setCustom] = useState("Does the writer ask to complete a purchase, reserve stock, or pay?");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(FEATURE_BANK.map((feature) => [feature.id, true])));
  const [trained, setTrained] = useState<Trained | null>(null);
  const [progress, setProgress] = useState(0);
  const rows = REVIEWS.slice(0, count);

  async function run() {
    setTrained(null);
    setProgress(0);
    jev.clear();
    const extracted = await mapPool(rows, 4, async (row) => {
      const response = await jev.run(featureRequest(row.text, row.priorPurchases, custom), { label: row.id, maxRetries: 1 });
      const features = [
        ...FEATURE_BANK.filter((feature) => enabled[feature.id]).map((feature) => readNoul(response.answers, feature.id)),
        readNoul(response.answers, "custom_feature"),
      ];
      return { row, features };
    }, { onSettle: (done) => setProgress(done) });
    setTrained(fit(extracted, names(enabled, custom)));
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {REVIEWS.filter((row) => row.bought === 1).length} of {REVIEWS.length} reviews are labeled as a purchase. The label is the ground truth. Prior purchases are a structured column that does not come from Jev.
          </p>
          <label className="block text-sm">
            Rows to extract
            <select className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2" onChange={(event) => setCount(Number(event.target.value))} value={count}>
              <option value={12}>12</option>
              <option value={24}>All 24</option>
            </select>
          </label>
          <label className="block text-sm">
            Proposed feature
            <textarea className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3" onChange={(event) => setCustom(event.target.value)} rows={3} value={custom} />
          </label>
          <ul className="space-y-2 text-sm">
            {FEATURE_BANK.map((feature) => (
              <li key={feature.id}>
                <label className="flex gap-2">
                  <input checked={enabled[feature.id]} onChange={(event) => setEnabled((current) => ({ ...current, [feature.id]: event.target.checked }))} type="checkbox" />
                  <span>
                    <span className="mono text-xs">{feature.id}</span> — {feature.instruction}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending} onClick={() => run().catch(() => undefined)} type="button">
            {jev.pending ? `Extracting ${progress}/${rows.length}` : "Extract and train"}
          </button>
          <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
          <ErrorNote message={jev.error} />
        </div>
        <div className="space-y-4">
          <CallStrip calls={jev.calls} pending={jev.pending} />
          {trained ? <Results trained={trained} /> : <Preview rows={rows} />}
        </div>
      </section>
    </div>
  );
}

function names(enabled: Record<string, boolean>, custom: string): string[] {
  return [...FEATURE_BANK.filter((feature) => enabled[feature.id]).map((feature) => feature.id), custom.slice(0, 42) || "custom"];
}

function fit(extracted: { row: ReviewRow; features: number[] }[], featureNames: string[]): Trained {
  const rows = extracted.map((item) => ({
    y: item.row.bought,
    x: item.features,
    prior: item.row.priorPurchases / 6,
    text: item.row.text,
    id: item.row.id,
  }));
  const { train, test } = splitIndexes(rows.length, 0.35, 11);
  const selection = forwardSelect(
    rows.map((row) => ({ x: row.x, y: row.y })),
    train,
    test,
  );
  const selected = selection.selected;
  const withStructured = (index: number) => [rows[index].prior, ...selected.map((feature) => rows[index].x[feature] ?? 0)];
  const model = trainLogistic(train.map((index) => ({ x: withStructured(index), y: rows[index].y })));
  const structured = trainLogistic(train.map((index) => ({ x: [rows[index].prior], y: rows[index].y })));
  const probability = test.map((index) => predictProbability(model, withStructured(index)));
  const structuredP = test.map((index) => predictProbability(structured, [rows[index].prior]));
  const y = test.map((index) => rows[index].y);
  const metrics = binaryMetrics(y, probability);
  const structuredMetrics = binaryMetrics(y, structuredP);
  const keywordP = test.map((index) => (keywordScore(rows[index].text) ? 1 : 0));
  const keyword = binaryMetrics(y, keywordP).accuracy;
  const base = majorityProbability(train.map((index) => rows[index].y));
  const baseline = binaryMetrics(y, test.map(() => base)).accuracy;
  const gained = lift(metrics.accuracy, Math.max(baseline, structuredMetrics.accuracy));
  return {
    accuracy: metrics.accuracy,
    baseline,
    keyword,
    structuredOnly: structuredMetrics.accuracy,
    auc: metrics.auc,
    logLoss: metrics.logLoss,
    liftPoints: gained.points,
    coefficients: [
      { name: "prior_purchases", weight: model.weights[0] ?? 0 },
      ...selected.map((feature, index) => ({ name: featureNames[feature] ?? `f${feature}`, weight: model.weights[index + 1] ?? 0 })),
    ],
    trail: selection.trail.map((step) => ({
      features: step.features.map((feature) => featureNames[feature] ?? String(feature)),
      testLogLoss: step.testLogLoss,
      testAccuracy: step.testAccuracy,
    })),
    holdout: test.map((index, offset) => ({ id: rows[index].id, y: rows[index].y, p: probability[offset], text: rows[index].text })),
  };
}

function keywordScore(text: string): boolean {
  const positive = /\b(order|pay|checkout|reserve|invoice|rush)\b/i.test(text);
  const negative = /\b(not|don't|dont|refund|return|cancel|passing|browsing)\b/i.test(text);
  return positive && !negative;
}

function Results({ trained }: { trained: Trained }) {
  const cards = [
    ["Model", formatPct(trained.accuracy, 0)],
    ["Structured only", formatPct(trained.structuredOnly, 0)],
    ["Majority", formatPct(trained.baseline, 0)],
    ["Keyword", formatPct(trained.keyword, 0)],
    ["AUC", trained.auc.toFixed(2)],
    ["Lift", `${trained.liftPoints >= 0 ? "+" : ""}${(trained.liftPoints * 100).toFixed(0)} pt`],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div className="rounded-2xl border border-line bg-card p-3" key={label}>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="mono mt-1 text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-line bg-card p-4">
        <p className="text-sm">Coefficients, structured column included</p>
        <div className="mt-3 space-y-2">
          {trained.coefficients.map((item) => (
            <div key={item.name}>
              <div className="flex justify-between text-xs">
                <span>{item.name}</span>
                <span className="mono">{item.weight.toFixed(2)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper-2">
                <div className="h-1.5 rounded-full bg-ink" style={{ width: `${Math.min(100, Math.abs(item.weight) * 30)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-card p-4">
        <p className="text-sm">Forward selection on the holdout</p>
        <p className="mt-1 text-xs text-muted">A candidate question is kept only when held-out log loss drops. The proposal bank, including the question you edited, lives in code so the loop is repeatable.</p>
        <ol className="mt-3 space-y-2 text-sm">
          {trained.trail.map((step, index) => (
            <li key={index}>
              {index === 0 ? "Base rate" : step.features.join(", ")} · loss {step.testLogLoss.toFixed(3)} · {formatPct(step.testAccuracy, 0)}
            </li>
          ))}
        </ol>
      </div>
      <ul className="space-y-2">
        {trained.holdout.map((row) => (
          <li className="rounded-2xl border border-line bg-card px-3 py-2 text-sm" key={row.id}>
            <span className="mono text-xs">{row.y === 1 ? "bought" : "did not"} · p {row.p.toFixed(2)}</span>
            <p className="text-muted">{row.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Preview({ rows }: { rows: ReviewRow[] }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card p-5">
      <p className="serif text-3xl">Labeled rows</p>
      <ul className="mt-4 space-y-3 text-sm">
        {rows.slice(0, 5).map((row) => (
          <li key={row.id}>
            <span className="mono text-xs text-muted">
              {row.bought ? "bought" : "no"} · prior {row.priorPurchases}
            </span>
            <p>{row.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
