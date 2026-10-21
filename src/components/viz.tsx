"use client";

import { useEffect, useState } from "react";
import type { Step, Tone } from "@/lib/decisions";
import { formatMs, formatPct, cx } from "@/lib/format";
import { formatUsd } from "@/lib/jev/cost";
import { legendEntries, sortedProbabilities } from "@/lib/jev/parse";
import { MODEL_TARGET_MS } from "@/lib/jev/types";
import type { CallRecord } from "./use-jev";
import type { MiniGraph, VizItem } from "@/lib/demos/types";

const toneClass: Record<Tone, string> = {
  go: "bg-moss text-white",
  review: "bg-gold text-white",
  stop: "bg-vermilion text-white",
  neutral: "bg-ink text-paper",
};

export function TonePill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cx("inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.14em]", toneClass[tone])}>{children}</span>;
}

export function NoulMeter({ label, p, caption }: { label: string; p: number; caption?: string }) {
  const width = `${Math.max(0, Math.min(100, p * 100))}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">{label}</p>
        <p className="mono text-sm">{formatPct(p, 0)}</p>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-paper-2">
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink/30" />
        <div className="bar-fill h-2 rounded-full bg-ink" style={{ width }} />
      </div>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

export function ChoiceBars({
  label,
  choice,
  confidence,
  probabilities,
  caption,
}: {
  label: string;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  caption?: string;
}) {
  const rows = sortedProbabilities(probabilities);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">{label}</p>
        <p className="mono text-xs text-muted">confidence {formatPct(confidence, 0)}</p>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex justify-between text-xs">
              <span className={row.key === choice ? "font-medium" : "text-muted"}>{row.key}</span>
              <span className="mono">{formatPct(row.p, 0)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-paper-2">
              <div className={cx("bar-fill h-1.5 rounded-full", row.key === choice ? "bg-vermilion" : "bg-ink/35")} style={{ width: `${row.p * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

export function ScoreRuler({
  label,
  score,
  confidence,
  legend,
  probabilities,
  caption,
}: {
  label: string;
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  caption?: string;
}) {
  const levels = legendEntries(legend);
  const max = levels.length > 1 ? levels[levels.length - 1].level : 1;
  const position = max <= 0 ? 0 : Math.max(0, Math.min(1, score / max));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">{label}</p>
        <p className="mono text-sm">
          {score.toFixed(2)} <span className="text-xs text-muted">/ {max}</span>
        </p>
      </div>
      <div className="relative mt-4 h-2 rounded-full bg-paper-2">
        <div className="absolute -top-1 h-4 w-4 rounded-full border-2 border-card bg-vermilion" style={{ left: `calc(${position * 100}% - 8px)` }} />
      </div>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, levels.length)}, minmax(0, 1fr))` }}>
        {levels.map((level) => (
          <div key={level.level}>
            <p className="mono text-[10px] text-muted">{formatPct(probabilities[String(level.level)] ?? 0, 0)}</p>
            <p className="text-[11px] leading-4 text-muted">{level.label}</p>
          </div>
        ))}
      </div>
      <p className="mono mt-1 text-[11px] text-muted">confidence {formatPct(confidence, 0)}</p>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

export function VizList({ items }: { items: VizItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        if (item.kind === "noul") return <NoulMeter caption={item.caption} key={`${item.label}-${index}`} label={item.label} p={item.p} />;
        if (item.kind === "choice") {
          return (
            <ChoiceBars
              caption={item.caption}
              choice={item.choice}
              confidence={item.confidence}
              key={`${item.label}-${index}`}
              label={item.label}
              probabilities={item.probabilities}
            />
          );
        }
        if (item.kind === "score") {
          return (
            <ScoreRuler
              caption={item.caption}
              confidence={item.confidence}
              key={`${item.label}-${index}`}
              label={item.label}
              legend={item.legend}
              probabilities={item.probabilities}
              score={item.score}
            />
          );
        }
        if (item.kind === "meter") {
          return <NoulMeter caption={item.caption} key={`${item.label}-${index}`} label={item.label} p={item.value} />;
        }
        return (
          <div key={`${item.label}-${index}`}>
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{item.label}</p>
            <p className="mt-1 text-sm">{item.value}</p>
            {item.detail ? <p className="text-xs text-muted">{item.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowRail({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((item) => (
        <li className="flex gap-3" key={item.label}>
          <span className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", item.status === "taken" ? "bg-vermilion" : "border border-line bg-card")} />
          <div>
            <p className={cx("text-sm", item.status === "skipped" && "text-muted")}>{item.label}</p>
            <p className="mono text-[11px] text-muted">{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CallStrip({ calls, pending }: { calls: CallRecord[]; pending: boolean }) {
  const latest = calls[0];
  const spent = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  return (
    <div
      className="rounded-2xl border border-line bg-card p-4"
      data-calls={calls.length}
      data-latency-ms={latest ? String(Math.round(latest.latencyMs)) : ""}
      data-spend-usd={latest?.costUsd == null ? "" : String(latest.costUsd)}
      data-testid="call-metrics"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">This call</p>
          <p className="mono mt-1 text-3xl">{pending && !latest ? <Elapsed /> : latest ? formatMs(latest.latencyMs) : "—"}</p>
        </div>
        <p className="max-w-xs text-xs leading-5 text-muted">
          Round trip through this app and the network. The {MODEL_TARGET_MS} ms figure is Jev&apos;s model time, drawn as a reference, not a promise about this hop.
        </p>
      </div>
      {latest ? (
        <dl className="mono mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">Model</dt>
            <dd>{latest.model}</dd>
          </div>
          <div>
            <dt className="text-muted">Input tokens</dt>
            <dd>{latest.usage.input_tokens ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Output tokens</dt>
            <dd>{latest.usage.output_tokens ?? "—"} free</dd>
          </div>
          <div>
            <dt className="text-muted">{calls.length > 1 ? "Latest cost" : "Cost"}</dt>
            <dd>{formatUsd(latest.costUsd)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted">{pending ? "Waiting on Jev." : "Run the sample to measure a live call."}</p>
      )}
      {calls.length > 1 ? (
        <p className="mono mt-3 text-[11px] text-muted">
          {calls.length} calls in this session · {formatUsd(spent)} input
        </p>
      ) : null}
      {calls.length > 1 ? (
        <div className="mt-4 flex h-10 items-end gap-1">
          {calls
            .slice()
            .reverse()
            .map((call) => (
              <div
                className="w-2 rounded-sm bg-ink/80"
                key={call.id}
                style={{ height: `${Math.max(8, Math.min(100, (MODEL_TARGET_MS / Math.max(call.latencyMs, MODEL_TARGET_MS)) * 100))}%` }}
                title={`${call.label} ${formatMs(call.latencyMs)}`}
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}

function Elapsed() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      setMs(performance.now() - started);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span>{formatMs(ms)}</span>;
}

export function ActionPlot({ x, y, xLabel, yLabel, action }: { x: number; y: number; xLabel: string; yLabel: string; action: string }) {
  const left = `${Math.max(2, Math.min(98, x * 100))}%`;
  const top = `${Math.max(2, Math.min(98, (1 - y) * 100))}%`;
  return (
    <div>
      <div className="relative h-48 rounded-2xl border border-line bg-paper">
        <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-vermilion" style={{ left, top }} />
        <span className="absolute left-2 top-2 text-[10px] uppercase tracking-[0.14em] text-muted">{action}</span>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>
          {xLabel} {formatPct(x, 0)}
        </span>
        <span>
          {yLabel} {formatPct(y, 0)}
        </span>
      </div>
    </div>
  );
}

export function MiniGraphView({ graph }: { graph: MiniGraph }) {
  const width = 520;
  const height = 220;
  const nodes = graph.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, graph.nodes.length) - Math.PI / 2;
    return { ...node, x: width / 2 + Math.cos(angle) * 160, y: height / 2 + Math.sin(angle) * 70 };
  });
  const at = (id: string) => nodes.find((node) => node.id === id);
  return (
    <svg className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
      {graph.edges.map((edge) => {
        const source = at(edge.source);
        const target = at(edge.target);
        if (!source || !target) return null;
        return (
          <g key={`${edge.source}-${edge.target}-${edge.label}`}>
            <line stroke="#17160f" strokeOpacity={0.35 + edge.p * 0.65} strokeWidth={1 + edge.p * 2} x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
            <text fill="#5f5a50" fontSize="10" textAnchor="middle" x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6}>
              {edge.label} {formatPct(edge.p, 0)}
            </text>
          </g>
        );
      })}
      {nodes.map((node) => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} fill="#fbf8f2" r="16" stroke="#17160f" />
          <text fill="#17160f" fontSize="11" textAnchor="middle" x={node.x} y={node.y + 28}>
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function RankedList({ items }: { items: { id: string; title: string; score: number; detail: string }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li className="flex items-center gap-3" key={item.id}>
          <span className="mono w-6 text-sm text-muted">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3 text-sm">
              <span>{item.title}</span>
              <span className="mono text-xs text-muted">{item.detail}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-paper-2">
              <div className="bar-fill h-1.5 rounded-full bg-ink" style={{ width: `${item.score * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl border border-vermilion/40 bg-vermilion/10 px-4 py-3 text-sm" role="alert">
      {message}
    </p>
  );
}

export function MissingKeyNote({ hasKey }: { hasKey: boolean }) {
  if (hasKey) return null;
  return (
    <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
      Sample data is loaded. Add an API key to make the live call. A missing or rejected key stays on this page as an error, not a blank screen.
    </p>
  );
}
