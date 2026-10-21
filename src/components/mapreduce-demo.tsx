"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CORPUS_SIZE, corpusSlice, kindCounts, type TraceKind } from "@/lib/corpus";
import { formatMs, formatNumber, formatPct } from "@/lib/format";
import { estimateCostUsd, estimateTokens, formatUsd, costUsd } from "@/lib/jev/cost";
import { JevCallError } from "@/lib/jev/errors";
import { readChoice, readNoul } from "@/lib/jev/parse";
import { mapPool } from "@/lib/pool";
import { traceRequest } from "@/lib/demos/mapreduce";
import { useJev } from "./use-jev";
import { ErrorNote, MissingKeyNote } from "./viz";

const SIZES = [12, 40, 100, 400, 2000];

type Row = {
  id: string;
  planted: TraceKind;
  predicted: TraceKind | null;
  review: number | null;
  match: number | null;
  ms: number;
  cost: number | null;
};

export function MapReduceDemo() {
  const jev = useJev();
  const [size, setSize] = useState(12);
  const [concurrency, setConcurrency] = useState(4);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const traces = useMemo(() => corpusSlice(size), [size]);
  const planted = kindCounts(traces);
  const sampleRequest = traceRequest(traces[0], query);
  const perItem = estimateTokens(sampleRequest);
  const estimate = estimateCostUsd(perItem * size);

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRows([]);
    setDone(0);
    const start = performance.now();
    setStartedAt(start);
    setNow(start);
    try {
      await mapPool(
        traces,
        concurrency,
        async (trace) => {
          const callStarted = performance.now();
          const response = await jev.run(traceRequest(trace, query), {
            label: trace.id,
            signal: controller.signal,
            maxRetries: 1,
          });
          const predicted = readChoice(response.answers, "outcome").choice as TraceKind;
          const row: Row = {
            id: trace.id,
            planted: trace.kind,
            predicted,
            review: readNoul(response.answers, "needs_review"),
            match: query.trim() ? readNoul(response.answers, "matches_query") : null,
            ms: performance.now() - callStarted,
            cost: costUsd(response.usage),
          };
          setRows((current) => [...current, row]);
          return row;
        },
        { signal: controller.signal, onSettle: (count) => setDone(count) },
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && !(error instanceof JevCallError && error.status === 499)) {
        /* useJev already stored the message */
      }
    } finally {
      setNow(performance.now());
    }
  }

  useEffect(() => {
    if (!jev.pending || startedAt == null) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [jev.pending, startedAt]);

  const elapsed = startedAt != null && now != null ? Math.max(0, now - startedAt) : 0;
  const throughput = rows.length > 0 && elapsed > 0 ? rows.length / (elapsed / 1000) : 0;
  const spent = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const correct = rows.filter((row) => row.predicted === row.planted).length;
  const predictedCounts = kindCounts(rows.filter((row) => row.predicted).map((row) => ({ id: row.id, kind: row.predicted as TraceKind, text: "" })));
  const hits = rows.filter((row) => (row.match ?? 0) >= 0.55);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-3xl border border-line bg-card p-5 md:grid-cols-4">
        <Stat label="Corpus" value={formatNumber(CORPUS_SIZE)} detail="generated traces" />
        <Stat label="This batch" value={formatNumber(size)} detail={`${formatNumber(perItem)} tok est. each`} />
        <Stat label="Estimated cost" value={formatUsd(estimate)} detail="input tokens only" />
        <Stat label="Planted mix" value={Object.values(planted).filter(Boolean).length ? "5 kinds" : "—"} detail={Object.entries(planted).map(([kind, count]) => `${kind} ${count}`).join(" · ")} />
      </section>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <label className="block text-sm">
            Batch size
            <select className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2" onChange={(event) => setSize(Number(event.target.value))} value={size}>
              {SIZES.map((value) => (
                <option key={value} value={value}>
                  {formatNumber(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Concurrency {concurrency}
            <input className="mt-1 w-full accent-vermilion" max={8} min={1} onChange={(event) => setConcurrency(Number(event.target.value))} type="range" value={concurrency} />
          </label>
          <label className="block text-sm">
            Optional search over the corpus
            <textarea className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3" onChange={(event) => setQuery(event.target.value)} placeholder="traces where the agent invented a fact" rows={3} value={query} />
          </label>
          <div className="flex gap-2">
            <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending} onClick={run} type="button">
              {jev.pending ? `Running ${done}/${size}` : jev.apiKey ? "Run the batch" : "Add a key to run"}
            </button>
            <button className="rounded-full border border-line px-4 py-2 text-sm" onClick={() => abortRef.current?.abort()} type="button">
              Stop
            </button>
          </div>
          <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
          <ErrorNote message={jev.error} />
          <p className="text-xs leading-5 text-muted">
            The full corpus is {formatNumber(CORPUS_SIZE)} items. A 2,000-item run is a real bill on your key, estimated above from a chars/4 token guess. Actual cost uses input tokens. Output tokens are free. Planted labels come from the generator that wrote each trace.
          </p>
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-card p-5">
            <div className="h-2 rounded-full bg-paper-2">
              <div className="bar-fill h-2 rounded-full bg-ink" style={{ width: `${size === 0 ? 0 : (done / size) * 100}%` }} />
            </div>
            <dl className="mono mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Done</dt>
                <dd>
                  {done}/{size}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Throughput</dt>
                <dd>{throughput ? `${throughput.toFixed(2)}/s` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Spent</dt>
                <dd>{formatUsd(spent)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Agreement</dt>
                <dd>{rows.length ? formatPct(correct / rows.length, 0) : "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex h-16 items-end gap-1">
              {(Object.keys(predictedCounts) as TraceKind[]).map((kind) => (
                <div className="flex-1" key={kind}>
                  <div className="rounded-sm bg-vermilion" style={{ height: `${rows.length ? (predictedCounts[kind] / rows.length) * 64 : 0}px` }} />
                  <p className="mt-1 text-[10px] text-muted">{kind.replaceAll("_", " ")}</p>
                </div>
              ))}
            </div>
            {query.trim() ? <p className="mt-3 text-sm">{hits.length} traces matched the query at 55% or above.</p> : null}
            <p className="mono mt-2 text-[11px] text-muted">{elapsed ? `elapsed ${formatMs(elapsed)}` : "idle"}</p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-2 text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-3 py-2">Trace</th>
                  <th className="px-3 py-2">Planted</th>
                  <th className="px-3 py-2">Jev</th>
                  <th className="px-3 py-2">Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(-8).reverse().map((row) => (
                  <tr className="border-t border-line bg-card" key={row.id}>
                    <td className="mono px-3 py-2 text-xs">{row.id}</td>
                    <td className="px-3 py-2">{row.planted.replaceAll("_", " ")}</td>
                    <td className="px-3 py-2">{row.predicted?.replaceAll("_", " ")}</td>
                    <td className="mono px-3 py-2">{row.review == null ? "—" : formatPct(row.review, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mono mt-1 text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
