"use client";

import { useMemo, useState } from "react";
import { DEFAULT_PACKET, GRAPH_EDGES, GRAPH_NODES, graphRequest, hierarchyRequest } from "@/lib/demos/graph-data";
import { formatPct } from "@/lib/format";
import { forceLayout, mostProbablePath } from "@/lib/graph";
import { HIERARCHY } from "@/lib/graph";
import { readChoice, readNoul } from "@/lib/jev/parse";
import { useJev } from "./use-jev";
import { CallStrip, ChoiceBars, ErrorNote, MissingKeyNote, NoulMeter } from "./viz";

type EdgeView = { id: string; source: string; target: string; label: string; p: number; probabilities: Record<string, number> };

function frameLayout(layout: Record<string, { x: number; y: number }>, width: number, height: number) {
  const points = Object.values(layout);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const framed: Record<string, { x: number; y: number }> = {};
  for (const [id, point] of Object.entries(layout)) {
    framed[id] = {
      x: 90 + ((point.x - minX) / (maxX - minX || 1)) * (width - 180),
      y: 70 + ((point.y - minY) / (maxY - minY || 1)) * (height - 160),
    };
  }
  return framed;
}

export function GraphDemo() {
  const jev = useJev();
  const [packet, setPacket] = useState(DEFAULT_PACKET);
  const [types, setTypes] = useState<Record<string, { choice: string; confidence: number; probabilities: Record<string, number> }>>({});
  const [edges, setEdges] = useState<EdgeView[]>([]);
  const [contradiction, setContradiction] = useState<number | null>(null);
  const [domain, setDomain] = useState<{ choice: string; confidence: number; probabilities: Record<string, number> } | null>(null);
  const [subtype, setSubtype] = useState<{ choice: string; confidence: number; probabilities: Record<string, number> } | null>(null);
  const [start, setStart] = useState("yield");
  const [goal, setGoal] = useState("loam");
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});

  const layout = useMemo(() => frameLayout(forceLayout(GRAPH_NODES, GRAPH_EDGES), 720, 460), []);
  const positions = { ...layout, ...drag };
  const path = edges.length ? mostProbablePath(edges.map((edge) => ({ source: edge.source, target: edge.target, p: edge.label === "none" ? 0.05 : edge.p })), start, goal) : null;

  async function annotate() {
    const response = await jev.run(graphRequest(packet), { label: "graph" });
    const nextTypes: typeof types = {};
    for (const node of GRAPH_NODES) nextTypes[node.id] = readChoice(response.answers, `type_${node.id}`);
    setTypes(nextTypes);
    setEdges(
      GRAPH_EDGES.map((edge) => {
        const answer = readChoice(response.answers, `rel_${edge.id}`);
        return { id: edge.id, source: edge.source, target: edge.target, label: answer.choice, p: answer.probabilities[answer.choice] ?? 0, probabilities: answer.probabilities };
      }),
    );
    setContradiction(readNoul(response.answers, "contradiction"));
    const domainAnswer = readChoice(response.answers, "domain");
    setDomain(domainAnswer);
    const child = await jev.run(hierarchyRequest(domainAnswer.choice, packet.records), { label: "hierarchy" });
    setSubtype(readChoice(child.answers, "subtype"));
  }

  const width = 720;
  const height = 460;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <section className="space-y-3">
          <label className="block text-sm">
            Records
            <textarea className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3" onChange={(event) => setPacket({ ...packet, records: event.target.value })} rows={8} value={packet.records} />
          </label>
          <label className="block text-sm">
            Yield note
            <textarea className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2" onChange={(event) => setPacket({ ...packet, yield_note: event.target.value })} rows={2} value={packet.yield_note} />
          </label>
          <label className="block text-sm">
            Irrigation claim
            <textarea className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2" onChange={(event) => setPacket({ ...packet, irrigation_claim: event.target.value })} rows={2} value={packet.irrigation_claim} />
          </label>
          <button className="rounded-full bg-vermilion px-5 py-2.5 text-sm text-white disabled:opacity-60" disabled={jev.pending} onClick={() => annotate().catch(() => undefined)} type="button">
            {jev.pending ? "Annotating…" : "Annotate the graph"}
          </button>
          <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
          <ErrorNote message={jev.error} />
        </section>
        <section className="rounded-3xl border border-line bg-card p-3">
          <p className="px-2 pb-2 text-sm text-muted">
            {edges.length
              ? "Classified by Jev. Drag a node to rearrange."
              : "Sample links from the loaded packet, drawn before any call. Run Annotate to classify each edge."}
          </p>
          <svg
            className="h-auto w-full touch-none"
            onPointerMove={(event) => {
              const moving = (event.currentTarget as SVGSVGElement).dataset.drag;
              if (!moving) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - rect.left) / rect.width) * width;
              const y = ((event.clientY - rect.top) / rect.height) * height;
              setDrag((current) => ({ ...current, [moving]: { x, y } }));
            }}
            onPointerUp={(event) => {
              delete event.currentTarget.dataset.drag;
            }}
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            {GRAPH_EDGES.map((edge) => {
              const view = edges.find((item) => item.id === edge.id);
              const source = positions[edge.source];
              const target = positions[edge.target];
              if (!source || !target) return null;
              const onPath = path?.path.includes(edge.source) && path.path.includes(edge.target);
              return (
                <g key={edge.id}>
                  <line stroke={onPath ? "#e23b16" : "#17160f"} strokeOpacity={view ? 0.45 + view.p * 0.55 : 0.85} strokeWidth={onPath ? 3 : 2.2} x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
                  {view ? (
                    <text fill="#5f5a50" fontSize="11" textAnchor="middle" x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8}>
                      {view.label} {formatPct(view.p, 0)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {GRAPH_NODES.map((node) => {
              const point = positions[node.id];
              if (!point) return null;
              return (
                <g
                  key={node.id}
                  onPointerDown={(event) => {
                    (event.currentTarget.ownerSVGElement as SVGSVGElement).dataset.drag = node.id;
                  }}
                  style={{ cursor: "grab" }}
                >
                  <circle cx={point.x} cy={point.y} fill={path?.path.includes(node.id) ? "#e23b16" : "#17160f"} r="18" />
                  <text fill="#17160f" fontSize="12" textAnchor="middle" x={point.x} y={point.y + 32}>
                    {node.label}
                  </text>
                  {types[node.id] ? (
                    <text fill="#5f5a50" fontSize="10" textAnchor="middle" x={point.x} y={point.y + 46}>
                      {types[node.id].choice}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <CallStrip calls={jev.calls} pending={jev.pending} />
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="text-sm">Probabilistic traversal</p>
          <div className="mt-3 flex gap-2">
            <select className="w-full rounded-xl border border-line bg-paper px-2 py-2 text-sm" onChange={(event) => setStart(event.target.value)} value={start}>
              {GRAPH_NODES.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
            <select className="w-full rounded-xl border border-line bg-paper px-2 py-2 text-sm" onChange={(event) => setGoal(event.target.value)} value={goal}>
              {GRAPH_NODES.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-sm">{path ? `${path.path.map((id) => GRAPH_NODES.find((node) => node.id === id)?.label).join(" → ")} · ${formatPct(path.probability, 0)}` : "Annotate the graph to weight the edges."}</p>
          {contradiction != null ? (
            <div className="mt-4">
              <NoulMeter label="Irrigation claim contradicts the yield note" p={contradiction} />
            </div>
          ) : null}
        </div>
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="text-sm">Hierarchical classification</p>
          <p className="mt-1 text-xs text-muted">The second call only exists because the first call chose the parent. Its options are the children of that parent.</p>
          {domain ? <div className="mt-3"><ChoiceBars choice={domain.choice} confidence={domain.confidence} label="Domain" probabilities={domain.probabilities} /></div> : null}
          {subtype && domain ? (
            <div className="mt-4">
              <ChoiceBars choice={subtype.choice} confidence={subtype.confidence} label={`Subtype of ${domain.choice}`} probabilities={subtype.probabilities} />
              <p className="mt-2 text-xs text-muted">{HIERARCHY[domain.choice]?.[subtype.choice]}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
