"use client";

import { useState } from "react";
import { pairwiseReorder, rankDescending, selectContext } from "@/lib/rank";
import { formatPct } from "@/lib/format";
import { readChoice, readNoul, readScore, scoreUnit } from "@/lib/jev/parse";
import { PASSAGES, pairwiseRequest, searchRequest, type Passage } from "@/lib/demos/search-data";
import { useJev } from "./use-jev";
import { CallStrip, ErrorNote, MissingKeyNote, ScoreRuler } from "./viz";

type Scored = Passage & { relevance: number; answer: ReturnType<typeof readScore> };

export function SearchDemo() {
  const jev = useJev();
  const [query, setQuery] = useState("Can I get a cash refund if I changed my mind?");
  const [passages, setPassages] = useState(PASSAGES);
  const [scored, setScored] = useState<Scored[] | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [reranked, setReranked] = useState<Scored[] | null>(null);
  const [threshold, setThreshold] = useState(0.45);

  async function run() {
    setReranked(null);
    const response = await jev.run(searchRequest(query, passages), { label: "search" });
    const next = passages.map((passage) => {
      const answer = readScore(response.answers, `rel_${passage.id}`);
      return { ...passage, relevance: scoreUnit(answer), answer };
    });
    setScored(rankDescending(next, (item) => item.relevance));
    setAnswered(readNoul(response.answers, "answered"));
  }

  async function rerank() {
    if (!scored) return;
    const top = scored.slice(0, 3);
    if (top.length < 2) return;
    const pairs: [Scored, Scored][] = [];
    if (top[0] && top[1]) pairs.push([top[0], top[1]]);
    if (top[0] && top[2]) pairs.push([top[0], top[2]]);
    if (top[1] && top[2]) pairs.push([top[1], top[2]]);
    const wins: { winner: string; loser: string; probability: number }[] = [];
    for (const [left, right] of pairs) {
      const response = await jev.run(pairwiseRequest(query, left, right), { label: `pair ${left.id}-${right.id}` });
      const better = readChoice(response.answers, "better");
      if (better.choice === "tie") continue;
      const loser = better.choice === left.id ? right.id : left.id;
      wins.push({ winner: better.choice, loser, probability: better.probabilities[better.choice] ?? better.confidence });
    }
    const order = pairwiseReorder(scored, wins);
    setReranked(order);
  }

  const shown = reranked ?? scored;
  const context = shown ? selectContext(shown, (item) => item.relevance, threshold, 3) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="space-y-4">
        <label className="block text-sm">
          Query
          <textarea className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3" onChange={(event) => setQuery(event.target.value)} rows={3} value={query} />
        </label>
        <div className="space-y-3">
          {passages.map((passage, index) => (
            <label className="block text-sm" key={passage.id}>
              {passage.title}
              <textarea
                className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2 text-sm"
                onChange={(event) => setPassages((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item)))}
                rows={2}
                value={passage.text}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">Editing a passage changes the next search. The pairwise step uses whatever the last search ranked.</p>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending} onClick={() => run().catch(() => undefined)} type="button">
            {jev.pending ? "Scoring…" : "Score the handbook"}
          </button>
          <button className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50" disabled={!scored || jev.pending} onClick={() => rerank().catch(() => undefined)} type="button">
            Pairwise rerank top 3
          </button>
        </div>
        <label className="block text-sm">
          Keep passages at or above {threshold.toFixed(2)}
          <input className="mt-1 w-full accent-vermilion" max={0.9} min={0.1} onChange={(event) => setThreshold(Number(event.target.value))} step={0.01} type="range" value={threshold} />
        </label>
        <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
        <ErrorNote message={jev.error} />
      </section>
      <section className="space-y-4">
        <CallStrip calls={jev.calls} pending={jev.pending} />
        {answered != null ? <p className="text-sm">The handbook contains an answer: {formatPct(answered, 0)}.</p> : null}
        {shown ? (
          <ol className="space-y-4">
            {shown.map((passage, index) => (
              <li className="rounded-3xl border border-line bg-card p-4" key={passage.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="mono text-xs text-muted">
                    {index + 1} · {passage.id}
                    {reranked ? " · after pairwise" : ""}
                  </p>
                  <p className="mono text-sm">{formatPct(passage.relevance, 0)}</p>
                </div>
                <h3 className="serif mt-1 text-2xl">{passage.title}</h3>
                <p className="mt-2 text-sm leading-6">{passage.text}</p>
                <div className="mt-3">
                  <ScoreRuler confidence={passage.answer.confidence} label="Relevance" legend={passage.answer.legend} probabilities={passage.answer.probabilities} score={passage.answer.score} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-3xl border border-dashed border-line bg-card p-5 text-sm text-muted">
            Each passage gets its own score question with the query and the passage text in the instruction. That is the cross-encoder shape: the model judges the pair, it does not embed them apart.
          </div>
        )}
        {shown ? (
          <div className="rounded-3xl border border-line bg-ink p-5 text-paper">
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-paper/60">Context for the next model</p>
            {context.length === 0 ? <p className="mt-3 text-sm">Nothing cleared the threshold.</p> : null}
            <ul className="mt-3 space-y-2 text-sm">
              {context.map((passage) => (
                <li key={passage.id}>
                  {passage.title} · {formatPct(passage.relevance, 0)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

