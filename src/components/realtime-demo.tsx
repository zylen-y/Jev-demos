"use client";

import { useRef, useState } from "react";
import { decideModeration, moderationThresholds } from "@/lib/decisions";
import { formatMs, formatPct } from "@/lib/format";
import { readNoul, readScore, scoreUnit } from "@/lib/jev/parse";
import { MODEL_TARGET_MS } from "@/lib/jev/types";
import { RELAY_MESSAGES, relayInput, relayRequest } from "@/lib/demos/realtime-data";
import { useJev } from "./use-jev";
import { CallStrip, ErrorNote, MissingKeyNote, TonePill } from "./viz";

type Round = {
  id: string;
  text: string;
  you: string | null;
  youMs: number | null;
  jev: string | null;
  jevMs: number | null;
  signals: { label: string; p: number }[];
};

export function RealtimeDemo() {
  const jev = useJev();
  const [mode, setMode] = useState<"watch" | "race">("watch");
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [history, setHistory] = useState<Round[]>([]);
  const [liveMs, setLiveMs] = useState<number | null>(null);
  const generation = useRef(0);
  const message = RELAY_MESSAGES[index % RELAY_MESSAGES.length];

  async function deal(nextIndex = index) {
    const token = generation.current + 1;
    generation.current = token;
    const item = RELAY_MESSAGES[nextIndex % RELAY_MESSAGES.length];
    setIndex(nextIndex);
    setRound({ id: item.id, text: item.text, you: null, youMs: null, jev: null, jevMs: null, signals: [] });
    setLiveMs(0);
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      if (generation.current !== token) return;
      setLiveMs(performance.now() - started);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    try {
      const response = await jev.run(relayRequest(item.text), {
        label: "relay",
        timeoutMs: 8000,
        maxRetries: 0,
      });
      if (generation.current !== token) return;
      cancelAnimationFrame(frame);
      const severity = readScore(response.answers, "severity");
      const input = relayInput({
        toxicity: readNoul(response.answers, "toxicity"),
        harassment: readNoul(response.answers, "harassment"),
        spam: readNoul(response.answers, "spam"),
        fraud: readNoul(response.answers, "fraud"),
        unsafe: readNoul(response.answers, "unsafe"),
        pii: readNoul(response.answers, "pii"),
        optOut: readNoul(response.answers, "opt_out"),
        policy: readNoul(response.answers, "policy_violation"),
        severity: scoreUnit(severity),
        confidence: severity.confidence,
      });
      const decision = decideModeration(input, moderationThresholds);
      const latency = performance.now() - started;
      const signals = [
        ["toxicity", input.toxicity],
        ["harassment", input.harassment],
        ["spam", input.spam],
        ["fraud", input.fraud],
        ["opt-out", input.optOut],
      ]
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3)
        .map(([label, p]) => ({ label: String(label), p: Number(p) }));
      const finished: Round = {
        id: item.id,
        text: item.text,
        you: null,
        youMs: null,
        jev: decision.action,
        jevMs: latency,
        signals,
      };
      setRound((current) => (current ? { ...finished, you: current.you, youMs: current.youMs } : finished));
      setHistory((current) => [{ ...finished }, ...current].slice(0, 8));
      setLiveMs(latency);
    } catch {
      cancelAnimationFrame(frame);
      if (generation.current === token) setLiveMs(null);
    }
  }

  function pick(action: string) {
    if (!round || round.you) return;
    const youMs = liveMs;
    setRound({ ...round, you: action, youMs });
  }

  const scale = Math.max(800, liveMs ?? 0, round?.jevMs ?? 0);
  const marker = (MODEL_TARGET_MS / scale) * 100;
  const fill = ((liveMs ?? 0) / scale) * 100;
  const agreement = history.filter((item) => item.you && item.jev && item.you === item.jev).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <section className="rounded-3xl border border-line bg-ink p-5 text-paper">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-paper/60">Relay</p>
          <div className="flex gap-2">
            {(["watch", "race"] as const).map((item) => (
              <button
                className={mode === item ? "rounded-full bg-paper px-3 py-1 text-sm text-ink" : "rounded-full border border-paper/20 px-3 py-1 text-sm"}
                key={item}
                onClick={() => setMode(item)}
                type="button"
              >
                {item === "watch" ? "Watch Jev" : "Race Jev"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-5 h-2 rounded-full bg-paper/15">
          <div className="absolute inset-y-0 w-px bg-vermilion" style={{ left: `${marker}%` }} />
          <div className="h-2 rounded-full bg-paper" style={{ width: `${Math.min(100, fill)}%` }} />
        </div>
        <div className="mt-1 flex justify-between mono text-[11px] text-paper/60">
          <span>{liveMs == null ? "—" : formatMs(liveMs)}</span>
          <span>{MODEL_TARGET_MS} ms model target</span>
        </div>
        <p className="serif mt-8 text-3xl leading-tight md:text-4xl">{round?.text ?? message.text}</p>
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["allow", "warn", "review", "block"].map((action) => (
            <button
              className={round?.jev === action ? "rounded-2xl bg-vermilion px-3 py-4 text-sm" : "rounded-2xl border border-paper/20 px-3 py-4 text-sm"}
              disabled={mode !== "race" || !round || Boolean(round.you)}
              key={action}
              onClick={() => pick(action)}
              type="button"
            >
              {action}
              {round?.you === action ? <span className="mt-1 block mono text-[10px]">you</span> : null}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-full bg-paper px-4 py-2 text-sm text-ink" disabled={jev.pending} onClick={() => deal(index)} type="button">
            {jev.pending ? "In flight…" : round ? "Send the next one" : "Start"}
          </button>
          <button
            className="rounded-full border border-paper/30 px-4 py-2 text-sm"
            onClick={() => {
              generation.current += 1;
              setRound(null);
              setLiveMs(null);
            }}
            type="button"
          >
            Clear
          </button>
        </div>
        {round?.jev ? (
          <div className="mt-6">
            <TonePill tone={round.jev === "allow" ? "go" : round.jev === "block" ? "stop" : "review"}>{round.jev}</TonePill>
            <p className="mono mt-3 text-sm text-paper/80">
              Jev {formatMs(round.jevMs ?? 0)}
              {round.jevMs != null && round.jevMs <= MODEL_TARGET_MS ? " · inside the 150 ms reference" : " · round trip is above the model-time reference"}
              {round.you ? ` · you said ${round.you} in ${formatMs(round.youMs ?? 0)}` : ""}
            </p>
            <div className="mt-4 space-y-3">
              {round.signals.map((signal) => (
                <div key={signal.label}>
                  <div className="flex justify-between text-xs text-paper/70">
                    <span>{signal.label}</span>
                    <span className="mono">{formatPct(signal.p, 0)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-paper/15">
                    <div className="h-1.5 rounded-full bg-paper" style={{ width: `${signal.p * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <section className="space-y-4">
        <CallStrip calls={jev.calls} pending={jev.pending} />
        <MissingKeyNote hasKey={Boolean(jev.apiKey)} />
        <ErrorNote message={jev.error} />
        <div className="rounded-3xl border border-line bg-card p-5">
          <p className="text-sm text-muted">Race score</p>
          <p className="serif text-4xl">{agreement}</p>
          <p className="text-sm text-muted">agreements with Jev, out of {history.filter((item) => item.you).length} picks. Watch mode just lets the model drive.</p>
          <ol className="mt-4 space-y-3">
            {history.map((item) => (
              <li key={`${item.id}-${item.jevMs}`} className="text-sm">
                <span className="mono text-xs text-muted">{item.jevMs == null ? "—" : formatMs(item.jevMs)}</span> {item.jev} · {item.text.slice(0, 72)}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs leading-5 text-muted">
          One request per message, nine questions in parallel. Retries are off so the bar is a single attempt. {RELAY_MESSAGES.length} lines are loaded; edit is the message you send — use the gallery samples as the stream.
        </p>
        <label className="block text-sm">
          Or type a line
          <textarea
            className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3"
            onChange={(event) => setRound({ id: "custom", text: event.target.value, you: null, youMs: null, jev: null, jevMs: null, signals: [] })}
            rows={3}
            value={round?.text ?? ""}
          />
        </label>
        <button className="rounded-full border border-line px-4 py-2 text-sm" disabled={jev.pending || !round?.text} onClick={() => void dealCustom(round?.text ?? "")} type="button">
          Route this line
        </button>
      </section>
    </div>
  );

  async function dealCustom(text: string) {
    const token = generation.current + 1;
    generation.current = token;
    setRound({ id: "custom", text, you: null, youMs: null, jev: null, jevMs: null, signals: [] });
    const started = performance.now();
    setLiveMs(0);
    let frame = 0;
    const tick = () => {
      if (generation.current !== token) return;
      setLiveMs(performance.now() - started);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    try {
      const response = await jev.run(relayRequest(text), { label: "relay", timeoutMs: 8000, maxRetries: 0 });
      if (generation.current !== token) return;
      cancelAnimationFrame(frame);
      const severity = readScore(response.answers, "severity");
      const decision = decideModeration(
        relayInput({
          toxicity: readNoul(response.answers, "toxicity"),
          harassment: readNoul(response.answers, "harassment"),
          spam: readNoul(response.answers, "spam"),
          fraud: readNoul(response.answers, "fraud"),
          unsafe: readNoul(response.answers, "unsafe"),
          pii: readNoul(response.answers, "pii"),
          optOut: readNoul(response.answers, "opt_out"),
          policy: readNoul(response.answers, "policy_violation"),
          severity: scoreUnit(severity),
          confidence: severity.confidence,
        }),
        moderationThresholds,
      );
      const latency = performance.now() - started;
      setLiveMs(latency);
      setRound({ id: "custom", text, you: null, youMs: null, jev: decision.action, jevMs: latency, signals: [] });
    } catch {
      cancelAnimationFrame(frame);
    }
  }
}
