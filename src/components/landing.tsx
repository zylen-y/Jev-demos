import Link from "next/link";
import { CATEGORY_COPY, DECISION_SHAPES, DEMOS } from "@/lib/catalog";
import { INPUT_USD_PER_MILLION, MODEL_TARGET_MS } from "@/lib/jev/types";
import { KeyButton } from "./key-context";

export function Landing() {
  const useCases = DEMOS.filter((demo) => demo.kind === "use-case");
  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-end gap-10 px-5 pb-8 pt-14 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rise">
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-muted">TypeSafe · System One · Jev</p>
          <h1 className="serif mt-4 text-[clamp(3.2rem,7vw,6.4rem)] leading-[0.9] tracking-tight">
            Every decision on the map, <span className="italic text-vermilion">live.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            Twenty-four demos of the TypeSafe use-case map. Paste your Jev key, then run classification, detection, scoring, routing, search, verification, and the rest on sample data or your own.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-full bg-ink px-5 py-3 text-sm text-paper" href="/gallery">
              Open the gallery
            </Link>
            <KeyButton prominent />
          </div>
        </div>
        <Instrument />
      </section>

      <section className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-3xl border border-line bg-line px-0 sm:grid-cols-4">
        {[
          ["~" + MODEL_TARGET_MS + " ms", "Model time, used as a reference on every call"],
          [`$${INPUT_USD_PER_MILLION}`, "Per million input tokens. Output is free."],
          [String(DEMOS.length), "Demos, one for each category and use case"],
          [String(DECISION_SHAPES.length), "Decision shapes, from the task table"],
        ].map(([value, label]) => (
          <div className="bg-paper px-5 py-6" key={label}>
            <p className="mono text-2xl">{value}</p>
            <p className="mt-2 text-sm text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-end justify-between gap-4">
          <h2 className="serif text-4xl">Five ways the map is cut</h2>
          <Link className="text-sm underline decoration-vermilion decoration-2 underline-offset-4" href="/gallery">
            All demos
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {CATEGORY_COPY.map((category, index) => {
            const demo = DEMOS.find((item) => item.eyebrow === category.title || item.slug === category.id || (category.id === "verification" && item.slug === "universal-verification"));
            const href = `/demos/${category.id === "verification" ? "universal-verification" : category.id === "map-reduce" ? "map-reduce" : category.id}`;
            return (
              <Link className="rounded-3xl border border-line bg-card p-6 transition hover:-translate-y-0.5" href={demo ? `/demos/${demo.slug}` : href} key={category.id}>
                <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">0{index + 1}</p>
                <h3 className="serif mt-3 text-3xl">{category.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{category.body}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <h2 className="serif text-4xl">Browse by the shape of the decision</h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {DECISION_SHAPES.map((shape) => (
            <Link className="rounded-full border border-line bg-card px-3 py-1.5 text-sm" href={`/gallery?shape=${encodeURIComponent(shape.id)}`} key={shape.id}>
              {shape.id}
            </Link>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          The same gallery filters by industry. {useCases.length} use cases carry the bullets from the map, and each one is tagged with the shapes it actually calls.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-3">
        {[
          ["1", "Paste a key", "It stays in localStorage. Nothing on the server remembers it."],
          ["2", "The browser calls this app", "A same-origin proxy forwards the documented System One request. The preflight from a browser did not return an allow-origin header."],
          ["3", "Jev answers, code decides", "Choice, score, and noul come back with probabilities. The branch, the rank, and the model pick are if-statements."],
        ].map(([n, title, body]) => (
          <div key={n}>
            <p className="mono text-vermilion">{n}</p>
            <h3 className="serif mt-2 text-3xl">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function Instrument() {
  const rows = [
    ["technical", 0.86],
    ["billing", 0.09],
    ["sales", 0.05],
  ];
  return (
    <aside className="rise rounded-3xl border border-line bg-card p-5 shadow-[0_20px_60px_rgb(23_22_15/0.06)]" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">Interface preview</p>
        <p className="mono text-[11px] text-muted">not a live call</p>
      </div>
      <p className="serif mt-4 text-3xl leading-none">Department</p>
      <p className="mt-2 text-sm text-muted">A choice distribution, the way a live demo draws one.</p>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value], index) => (
          <div key={label}>
            <div className="flex justify-between text-sm">
              <span>{label}</span>
              <span className="mono">{Math.round(Number(value) * 100)}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-paper-2">
              <div className="bar-fill h-2 rounded-full bg-ink" style={{ width: `${Number(value) * 100}%`, transitionDelay: `${index * 80}ms` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Stat label="Confidence" value="0.79" />
        <Stat label="Target" value={`${MODEL_TARGET_MS} ms`} />
        <Stat label="Input" value={`$${INPUT_USD_PER_MILLION}/Mtok`} />
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mono mt-1 text-sm">{value}</p>
    </div>
  );
}
