"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DECISION_SHAPES, DEMOS, industries, type DecisionShape, type DemoMeta } from "@/lib/catalog";

export function Gallery() {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const shape = params.get("shape") ?? "";
  const industry = params.get("industry") ?? "";
  const kind = params.get("kind") ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    const search = next.toString();
    router.replace(search ? `/gallery?${search}` : "/gallery", { scroll: false });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DEMOS.filter((demo) => {
      if (shape && !demo.shapes.includes(shape as DecisionShape)) return false;
      if (industry && demo.industry !== industry) return false;
      if (kind && demo.kind !== kind) return false;
      if (!needle) return true;
      const haystack = [demo.title, demo.summary, demo.industry, demo.eyebrow, ...demo.shapes, ...demo.bullets].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [industry, kind, query, shape]);

  const activeShape = DECISION_SHAPES.find((item) => item.id === shape);

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-muted">Gallery</p>
      <h1 className="serif mt-3 text-5xl leading-none md:text-6xl">All {DEMOS.length} decisions.</h1>
      <p className="mt-4 max-w-2xl text-muted">Filter by industry or by the decision shape from the task table. Each card opens a demo with sample data and a live call.</p>

      <div className="mt-8 flex flex-col gap-4">
        <input
          className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, industries, shapes, bullets"
          value={query}
        />
        <FilterRow label="Kind" onChange={(value) => setParam("kind", value)} options={[["", "All"], ["category", "Patterns"], ["use-case", "Use cases"]]} value={kind} />
        <FilterRow
          label="Industry"
          onChange={(value) => setParam("industry", value)}
          options={[["", "All"], ...industries().map((item) => [item, item] as [string, string])]}
          value={industry}
        />
        <FilterRow
          label="Shape"
          onChange={(value) => setParam("shape", value)}
          options={[["", "All"], ...DECISION_SHAPES.map((item) => [item.id, item.id] as [string, string])]}
          value={shape}
        />
      </div>

      {activeShape ? (
        <p className="mt-4 text-sm text-muted">
          <span className="text-ink">{activeShape.id}.</span> {activeShape.reach}. {activeShape.examples}.
        </p>
      ) : null}

      <p className="mono mt-6 text-xs text-muted">{visible.length} showing</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {visible.map((demo, index) => (
          <DemoCard demo={demo} index={index} key={demo.slug} />
        ))}
      </div>
      {visible.length === 0 ? <p className="mt-8 text-sm">Nothing matches those filters.</p> : null}
    </main>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <p className="mono w-24 shrink-0 pt-1.5 text-[11px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([id, name]) => (
          <button
            aria-pressed={value === id}
            className={value === id ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper" : "rounded-full border border-line bg-card px-3 py-1.5 text-sm"}
            key={id || "all"}
            onClick={() => onChange(id)}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function DemoCard({ demo, index }: { demo: DemoMeta; index: number }) {
  return (
    <Link className="flex h-full flex-col rounded-3xl border border-line bg-card p-5" href={demo.slug === "realtime" ? "/relay" : `/demos/${demo.slug}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">{demo.industry}</p>
        <p className="mono text-[11px] text-muted">{String(index + 1).padStart(2, "0")}</p>
      </div>
      <h2 className="serif mt-3 text-3xl leading-none">{demo.title}</h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted">{demo.summary}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {demo.shapes.slice(0, 4).map((shape) => (
          <span className="rounded-full bg-paper px-2 py-1 text-[11px]" key={shape}>
            {shape}
          </span>
        ))}
      </div>
    </Link>
  );
}
