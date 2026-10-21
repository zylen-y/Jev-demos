"use client";

import Link from "next/link";
import { getDemo } from "@/lib/catalog";
import { getCaseDemo } from "@/lib/demos/registry";
import { CaseDemo } from "./case-demo";
import { FeaturesDemo } from "./features-demo";
import { ForecastDemo } from "./forecast-demo";
import { GraphDemo } from "./graph-demo";
import { LintDemo } from "./lint-demo";
import { MapReduceDemo } from "./mapreduce-demo";
import { RealtimeDemo } from "./realtime-demo";
import { SearchDemo } from "./search-demo";

const SPECIALS: Record<string, () => React.ReactNode> = {
  realtime: () => <RealtimeDemo />,
  "map-reduce": () => <MapReduceDemo />,
  search: () => <SearchDemo />,
  "semantic-lint": () => <LintDemo />,
  "feature-extraction": () => <FeaturesDemo />,
  "demand-forecasting": () => <ForecastDemo />,
  "knowledge-graph": () => <GraphDemo />,
};

export function DemoExperience({ slug }: { slug: string }) {
  const demo = getDemo(slug);
  if (!demo) return null;
  const special = SPECIALS[slug];
  const config = getCaseDemo(slug);
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Link className="text-sm text-muted" href="/gallery">
        ← Gallery
      </Link>
      <p className="mono mt-6 text-[11px] uppercase tracking-[0.18em] text-muted">
        {demo.kind === "category" ? "Pattern" : "Use case"} · {demo.industry}
      </p>
      <h1 className="serif mt-3 text-5xl leading-none md:text-6xl">{demo.title}</h1>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-muted">{demo.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {demo.shapes.map((shape) => (
          <Link className="rounded-full border border-line bg-card px-3 py-1 text-xs" href={`/gallery?shape=${encodeURIComponent(shape)}`} key={shape}>
            {shape}
          </Link>
        ))}
      </div>
      <ul className="mt-6 max-w-3xl space-y-2 text-sm leading-6">
        {demo.bullets.map((bullet) => (
          <li className="flex gap-3" key={bullet}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <div className="mt-10">{special ? special() : config ? <CaseDemo config={config} /> : null}</div>
    </main>
  );
}
