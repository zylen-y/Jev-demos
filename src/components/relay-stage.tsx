"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKey } from "@/components/key-context";
import { postSystemOne } from "@/lib/jev/browser";
import { costUsd, estimateCostUsd, estimateTokens } from "@/lib/jev/cost";
import { JevCallError } from "@/lib/jev/errors";
import { mapPool } from "@/lib/pool";
import {
  actionFromAnswers,
  countFlips,
  DEFAULT_POLICY,
  mockAction,
  readyPrefix,
  REJUDGE_POLICY,
  relayRequest,
  WAVE_MS,
  type JudgedRow,
  type RelayAction,
} from "@/lib/relay/judge";
import { metricDataAttributes, spendFromSummary, type MetricReading } from "@/lib/relay/metrics";
import { columnsFor, paintRelayField } from "@/lib/relay/paint";
import { formatRelayUsd, percentile, summarizeRelay, type RelaySample, type RelaySummary } from "@/lib/relay/stats";
import { backfillWikipedia, editFromEvent, RELAY_BACKLOG, WIKI_STREAM_URL, type WikiEdit } from "@/lib/relay/wiki";

type Slot = JudgedRow & { edit: WikiEdit };
type Sample = RelaySample & { modelMs: number | null };
type Phase = "loading" | "ready" | "armed" | "judging" | "playing" | "done";

const EMPTY_SUMMARY: RelaySummary = {
  decisions: 0,
  p50RoundTripMs: null,
  p95RoundTripMs: null,
  p50UpstreamMs: null,
  p95UpstreamMs: null,
  spendUsd: 0,
  inputTokens: 0,
  unpriced: 0,
};

export function RelayStage() {
  const params = useSearchParams();
  const mock = params.get("mock") === "1";
  const waveScene = params.get("scene") === "wave";
  const hold = params.get("hold") === "1";
  const autostart = params.get("autostart") === "1";
  const { apiKey, ready, open } = useKey();

  const [policy, setPolicy] = useState(waveScene ? REJUDGE_POLICY : DEFAULT_POLICY);
  const [cells, setCells] = useState<Slot[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [revealed, setRevealed] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [streamOn, setStreamOn] = useState(false);
  const [streamStatus, setStreamStatus] = useState<"idle" | "open" | "reconnecting">("idle");
  const [arrived, setArrived] = useState(0);
  const [localPassMs, setLocalPassMs] = useState<number | null>(null);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const [measured, setMeasured] = useState<MetricReading | null>(null);
  const [ledger, setLedger] = useState({ stream: EMPTY_SUMMARY, rejudge: EMPTY_SUMMARY, modelP50: null as number | null });

  const cellsRef = useRef<Slot[]>([]);
  const revealedRef = useRef(0);
  const paintedRef = useRef(0);
  const playRef = useRef(false);
  const lockRef = useRef(false);
  const seenRef = useRef(new Set<string>());
  const queueRef = useRef<WikiEdit[]>([]);
  const committedRef = useRef(DEFAULT_POLICY);
  const policyRef = useRef(policy);
  const mockRef = useRef(mock);
  const apiKeyRef = useRef(apiKey);
  const waveSceneRef = useRef(waveScene);
  const phaseRef = useRef(phase);
  const beginWaveRef = useRef(() => {});
  const flushQueueRef = useRef(() => {});
  const runRejudgeRef = useRef<(signal?: AbortSignal) => Promise<void>>(async () => {});
  const takeEditRef = useRef<(edit: WikiEdit) => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const patchesRef = useRef(new Map<string, Partial<Slot>>());
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamSamplesRef = useRef<Sample[]>([]);
  const rejudgeSamplesRef = useRef<Sample[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  const openRef = useRef(open);

  const sceneKey = `${String(mock)}:${String(waveScene)}:${String(hold)}`;
  const [sceneKeySeen, setSceneKeySeen] = useState(sceneKey);
  if (sceneKeySeen !== sceneKey) {
    setSceneKeySeen(sceneKey);
    setPhase("loading");
    setCells([]);
    setRevealed(0);
    setBanner(null);
    setStreamOn(false);
  }

  function publishLedger() {
    const stream = summarizeRelay(streamSamplesRef.current);
    const rejudge = summarizeRelay(rejudgeSamplesRef.current);
    const source = rejudgeSamplesRef.current.some((sample) => sample.modelMs != null)
      ? rejudgeSamplesRef.current
      : streamSamplesRef.current;
    const modelP50 = percentile(
      source.flatMap((sample) => (sample.modelMs == null ? [] : [sample.modelMs])),
      50,
    );
    setLedger({ stream, rejudge, modelP50 });
  }

  function applyPatches() {
    const batch = patchesRef.current;
    if (batch.size === 0) return;
    patchesRef.current = new Map();
    const next = cellsRef.current.map((slot) => {
      const patch = batch.get(slot.edit.id);
      return patch ? { ...slot, ...patch } : slot;
    });
    cellsRef.current = next;
    setCells(next);
    publishLedger();
  }

  function queuePatch(id: string, patch: Partial<Slot>) {
    const current = patchesRef.current.get(id);
    patchesRef.current.set(id, { ...current, ...patch });
    if (patchTimerRef.current) return;
    patchTimerRef.current = setTimeout(() => {
      patchTimerRef.current = null;
      if (aliveRef.current) applyPatches();
    }, 50);
  }

  function flushPatches() {
    if (patchTimerRef.current) {
      clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }
    applyPatches();
  }

  function beginWave() {
    if (cellsRef.current.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lockRef.current = true;
    if (reduce) {
      const total = cellsRef.current.length;
      revealedRef.current = total;
      paintedRef.current = total;
      setRevealed(total);
      playRef.current = false;
      lockRef.current = false;
      setPhase("done");
      return;
    }
    paintedRef.current = 0;
    revealedRef.current = 0;
    setRevealed(0);
    playRef.current = true;
    setPhase("playing");
  }

  function flushQueue() {
    const queued = queueRef.current.splice(0);
    if (queued.length === 0) return;
    const slots: Slot[] = queued.map((edit) => ({
      edit,
      before: mockRef.current ? mockAction(edit, committedRef.current) : null,
      after: null,
    }));
    setCells((prev) => {
      const next = [...slots, ...prev].slice(0, RELAY_BACKLOG);
      cellsRef.current = next;
      return next;
    });
    setArrived((count) => count + queued.length);
    if (!mockRef.current && apiKeyRef.current) {
      for (const slot of slots) void judgeOne(slot, "before", committedRef.current, "stream");
    }
  }

  function takeEdit(edit: WikiEdit) {
    if (seenRef.current.has(edit.id)) return;
    seenRef.current.add(edit.id);
    if (lockRef.current) {
      queueRef.current.push(edit);
      return;
    }
    const slot: Slot = {
      edit,
      before: mockRef.current ? mockAction(edit, DEFAULT_POLICY) : null,
      after: null,
    };
    setCells((prev) => {
      const next = [slot, ...prev].slice(0, RELAY_BACKLOG);
      cellsRef.current = next;
      return next;
    });
    setArrived((count) => count + 1);
    if (!mockRef.current && apiKeyRef.current) void judgeOne(slot, "before", committedRef.current, "stream");
  }

  async function judgeOne(slot: Slot, field: "before" | "after", policyText: string, bucket: "stream" | "rejudge") {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const call = await postSystemOne({
        apiKey: key,
        request: relayRequest(slot.edit, policyText),
        timeoutMs: 8000,
        maxRetries: 0,
        signal: abortRef.current?.signal,
      });
      const action = actionFromAnswers(call.response.answers);
      const sample: Sample = {
        roundTripMs: call.latencyMs,
        upstreamMs: call.upstreamMs,
        modelMs: call.modelMs,
        costUsd: costUsd(call.response.usage),
        inputTokens: call.response.usage.input_tokens,
      };
      (bucket === "rejudge" ? rejudgeSamplesRef : streamSamplesRef).current.push(sample);
      queuePatch(slot.edit.id, { [field]: action, failed: false });
    } catch (error) {
      if (abortRef.current?.signal.aborted) return;
      queuePatch(slot.edit.id, { failed: true });
      if (aliveRef.current) setNote(errorText(error));
    }
  }

  async function judgeMissing(
    list: Slot[],
    field: "before" | "after",
    policyText: string,
    signal: AbortSignal,
    skipFilled: boolean,
  ) {
    const pending = list.filter((slot) => (skipFilled ? slot[field] == null && !slot.failed : true));
    await mapPool(
      pending,
      6,
      async (slot) => {
        try {
          const call = await postSystemOne({
            apiKey: apiKeyRef.current,
            request: relayRequest(slot.edit, policyText),
            timeoutMs: 8000,
            maxRetries: 0,
            signal,
          });
          const action = actionFromAnswers(call.response.answers);
          rejudgeSamplesRef.current.push({
            roundTripMs: call.latencyMs,
            upstreamMs: call.upstreamMs,
            modelMs: call.modelMs,
            costUsd: costUsd(call.response.usage),
            inputTokens: call.response.usage.input_tokens,
          });
          queuePatch(slot.edit.id, { [field]: action, failed: false });
        } catch (error) {
          if (signal.aborted) throw error;
          queuePatch(slot.edit.id, { failed: true });
          if (aliveRef.current) setNote(errorText(error));
        }
      },
      { signal },
    );
  }

  async function runRejudge(signal?: AbortSignal) {
    if (playRef.current || phaseRef.current === "judging" || cellsRef.current.length === 0) return;
    if (!mockRef.current && !apiKeyRef.current) {
      openRef.current();
      return;
    }
    const policyText = policyRef.current.trim();
    if (!policyText) return;
    lockRef.current = true;
    setNote(null);
    setPhase("judging");
    const snapshot = cellsRef.current.map((slot) => ({
      ...slot,
      before: slot.after ?? slot.before,
      after: null,
      failed: false,
    }));
    cellsRef.current = snapshot;
    setCells(snapshot);
    try {
      if (mockRef.current) {
        const started = performance.now();
        const next = snapshot.map((slot) => ({
          ...slot,
          before: slot.before ?? mockAction(slot.edit, committedRef.current),
          after: mockAction(slot.edit, policyText),
        }));
        cellsRef.current = next;
        setCells(next);
        const durationMs = performance.now() - started;
        setLocalPassMs(durationMs);
        setMeasured({
          mock: true,
          burstSize: next.length,
          burstDurationMs: durationMs,
          p50LatencyMs: null,
          p95LatencyMs: null,
          spendUsd: null,
        });
        committedRef.current = policyText;
        beginWaveRef.current();
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const linked = signal ?? controller.signal;
      rejudgeSamplesRef.current = [];
      const started = performance.now();
      await judgeMissing(snapshot, "before", committedRef.current, linked, true);
      flushPatches();
      await judgeMissing(cellsRef.current, "after", policyText, linked, false);
      flushPatches();
      if (linked.aborted || !aliveRef.current) return;
      const durationMs = performance.now() - started;
      const summary = summarizeRelay(rejudgeSamplesRef.current);
      setWallMs(durationMs);
      setMeasured({
        mock: false,
        burstSize: cellsRef.current.length,
        burstDurationMs: durationMs,
        p50LatencyMs: summary.p50RoundTripMs,
        p95LatencyMs: summary.p95RoundTripMs,
        spendUsd: spendFromSummary(summary),
      });
      committedRef.current = policyText;
      beginWaveRef.current();
    } catch (error) {
      lockRef.current = false;
      if (!aliveRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPhase("ready");
      setNote(errorText(error));
    }
  }

  useEffect(() => {
    policyRef.current = policy;
    mockRef.current = mock;
    apiKeyRef.current = apiKey;
    waveSceneRef.current = waveScene;
    phaseRef.current = phase;
    openRef.current = open;
    beginWaveRef.current = beginWave;
    flushQueueRef.current = flushQueue;
    takeEditRef.current = takeEdit;
    runRejudgeRef.current = runRejudge;
  });

  useEffect(() => {
    aliveRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let last = performance.now();
    let lastPublish = 0;
    let frame = 0;
    const tick = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bitmapW = Math.max(1, Math.floor(rect.width * dpr));
        const bitmapH = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
          canvas.width = bitmapW;
          canvas.height = bitmapH;
        }
        const context = canvas.getContext("2d");
        if (context && rect.width > 0 && rect.height > 0) {
          paintRelayField(context, {
            width: rect.width,
            height: rect.height,
            dpr,
            cells: cellsRef.current,
            revealed: revealedRef.current,
            columns: columnsFor(rect.width, rect.height, cellsRef.current.length),
          });
        }
      }
      if (playRef.current) {
        const total = cellsRef.current.length;
        const ready = readyPrefix(cellsRef.current);
        const dt = Math.min(48, Math.max(0, now - last));
        const rate = total > 0 ? total / WAVE_MS : 0;
        paintedRef.current = Math.min(ready, paintedRef.current + dt * rate);
        const next = Math.floor(paintedRef.current);
        revealedRef.current = next;
        const finished = total > 0 && next >= total && ready >= total;
        if (finished || now - lastPublish > 60) {
          lastPublish = now;
          setRevealed(next);
          if (finished) {
            playRef.current = false;
            lockRef.current = false;
            setPhase("done");
            flushQueueRef.current();
          }
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onPlay = () => beginWaveRef.current();
    window.addEventListener("relay-play", onPlay);
    return () => {
      aliveRef.current = false;
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
      window.removeEventListener("relay-play", onPlay);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    seenRef.current = new Set();
    backfillWikipedia(RELAY_BACKLOG)
      .then((edits) => {
        if (cancel) return;
        const slots: Slot[] = edits.map((edit) => ({
          edit,
          before: mock ? mockAction(edit, DEFAULT_POLICY) : null,
          after: mock && waveScene ? mockAction(edit, REJUDGE_POLICY) : null,
        }));
        for (const slot of slots) seenRef.current.add(slot.edit.id);
        cellsRef.current = slots;
        setCells(slots);
        if (slots.length === 0) {
          setBanner("Wikipedia did not return recent changes.");
          setPhase("ready");
          return;
        }
        if (mock && waveScene) committedRef.current = REJUDGE_POLICY;
        if (mock && waveScene && hold) setPhase("armed");
        else if (mock && waveScene) beginWaveRef.current();
        else {
          setPhase("ready");
          if (!waveScene) setStreamOn(true);
        }
      })
      .catch(() => {
        if (cancel) return;
        setBanner("Could not reach English Wikipedia for the backlog.");
        setPhase("ready");
      });
    return () => {
      cancel = true;
    };
  }, [hold, mock, waveScene]);

  useEffect(() => {
    if (!streamOn) return;
    const source = new EventSource(WIKI_STREAM_URL);
    source.onopen = () => setStreamStatus("open");
    source.onerror = () => setStreamStatus("reconnecting");
    source.onmessage = (event) => {
      try {
        const edit = editFromEvent(JSON.parse(String(event.data)));
        if (edit) takeEditRef.current(edit);
      } catch {
        /* a bad event should not close the stream */
      }
    };
    return () => source.close();
  }, [streamOn]);

  useEffect(() => {
    if (!autostart || mock || !waveScene || !ready || !apiKey || cells.length === 0) return;
    const controller = new AbortController();
    void runRejudgeRef.current(controller.signal);
    return () => controller.abort();
  }, [apiKey, autostart, cells.length, mock, ready, waveScene]);

  const flips = countFlips(cells, revealed);
  const decisions = cells.reduce((sum, slot) => sum + (slot.before ? 1 : 0), 0);
  const activeSummary = ledger.rejudge.decisions > 0 ? ledger.rejudge : ledger.stream;
  const examples = useMemo(() => pickExamples(cells, revealed), [cells, revealed]);
  const estimate = useMemo(() => {
    const first = cells[0];
    if (mock || !first) return null;
    const passes = first.before == null ? 2 : 1;
    return estimateCostUsd(estimateTokens(relayRequest(first.edit, policy || DEFAULT_POLICY)) * cells.length * passes);
  }, [cells, mock, policy]);

  const streamLabel = !streamOn
    ? "Backlog"
    : streamStatus === "open"
      ? `Stream open · ${arrived.toLocaleString()} new`
      : streamStatus === "reconnecting"
        ? "Stream reconnecting"
        : "Opening the stream";

  function onRejudge() {
    if (!mock && !apiKey) {
      open();
      return;
    }
    void runRejudgeRef.current();
  }

  const busy = phase === "loading" || phase === "judging" || phase === "playing";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#100e0c] text-[#efeae0]"
      data-backlog={cells.length}
      data-mock={mock ? "1" : "0"}
      data-testid="relay-stage"
    >
      <div
        className="sr-only"
        data-testid="relay-metrics"
        {...metricDataAttributes(
          measured ?? {
            mock,
            burstSize: null,
            burstDurationMs: null,
            p50LatencyMs: null,
            p95LatencyMs: null,
            spendUsd: null,
          },
        )}
      />
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-4">
          <Link className="serif text-xl leading-none" href="/">
            Jev Atlas
          </Link>
          <p className="mono hidden text-[11px] uppercase tracking-[0.18em] text-[#efeae0]/60 sm:block">Relay · Wikipedia</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="mono hidden text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/55 md:block" data-testid="relay-stream">
            {streamLabel}
          </p>
          {mock ? (
            <p className="bg-[#e23b16] px-3 py-1.5 text-sm font-semibold tracking-[0.22em] text-white">MOCKED</p>
          ) : (
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/70">{ready && apiKey ? "Key in this browser" : "No key yet"}</p>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0" data-state={phase} data-testid="relay-wave">
          <canvas aria-hidden="true" className="h-full w-full" ref={canvasRef} />
        </div>
        <div className="pointer-events-none absolute left-0 top-0 h-64 w-[min(100%,28rem)] bg-gradient-to-br from-[#100e0c] via-[#100e0c]/82 to-transparent" />
        <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6">
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-[#efeae0]/60">Flipped</p>
          <p
            className={`serif text-6xl leading-none sm:text-7xl lg:text-8xl ${flips.flipped > 0 ? "text-[#ff3b1f]" : "text-[#efeae0]"}`}
            data-count={flips.flipped}
            data-testid="relay-flips"
          >
            {flips.flipped.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-[#efeae0]/75">
            {flips.unchanged.toLocaleString()} unchanged
            <span className="mono ml-3 text-[11px] uppercase tracking-[0.14em]" data-count={revealed} data-testid="relay-revealed">
              {revealed.toLocaleString()} of {cells.length.toLocaleString()}
            </span>
          </p>
          <Legend />
        </div>
        <aside className="absolute bottom-4 right-4 hidden w-[340px] lg:block">
          <ExampleCard examples={examples} live={cells.slice(0, 5)} mock={mock} showFlips={flips.flipped > 0} />
        </aside>
        {phase === "loading" ? (
          <p className="absolute inset-x-0 top-1/2 text-center text-sm text-[#efeae0]/70">
            Pulling the last {RELAY_BACKLOG.toLocaleString()} English Wikipedia edits…
          </p>
        ) : null}
        {banner ? <p className="absolute inset-x-6 top-1/2 text-center text-sm text-[#efeae0]">{banner}</p> : null}
      </div>

      <footer className="border-t border-white/10 bg-[#14120f] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-0 flex-1 text-sm" htmlFor="relay-policy">
            <span className="mono mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/50">Policy</span>
            <textarea
              className="h-16 w-full resize-none rounded-md border border-white/15 bg-[#0c0b09] px-3 py-2 text-sm leading-5 text-[#efeae0]"
              id="relay-policy"
              data-testid="relay-policy"
              onChange={(event) => setPolicy(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  onRejudge();
                }
              }}
              rows={2}
              spellCheck={false}
              value={policy}
            />
          </label>
          <button
            className="h-12 shrink-0 rounded-md bg-[#e23b16] px-5 text-sm font-medium text-white disabled:opacity-50 lg:h-16"
            data-testid="relay-rejudge"
            disabled={busy || cells.length === 0 || policy.trim() === ""}
            onClick={onRejudge}
            type="button"
          >
            {phase === "playing" ? "Sweeping" : phase === "judging" ? "Judging" : "Re-judge the backlog"}
          </button>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#efeae0]/80">
          <Stat label="Decisions" testId="relay-decisions" value={decisions.toLocaleString()} count={decisions} />
          <Stat label="Round trip p50" value={formatMs(activeSummary.p50RoundTripMs)} />
          <Stat label="Upstream p50" value={formatMs(activeSummary.p50UpstreamMs)} />
          <Stat label="Model p50" value={formatMs(ledger.modelP50)} />
          <Stat
            label="Re-judge"
            value={wallMs != null ? formatMs(wallMs) : localPassMs != null ? `${formatMs(localPassMs)} local` : "—"}
          />
          <Stat label="Wave" value={revealed > 0 || phase === "playing" ? `${(WAVE_MS / 1000).toFixed(1)} s playback` : "—"} />
          <Stat label="Spend" testId="relay-spend" value={mock ? "—" : spendText(activeSummary)} />
        </dl>
        <p className="mt-2 text-[11px] leading-4 text-[#efeae0]/45">
          {mock
            ? "Mocked decisions, measured on this page. Wikipedia edits are live. This is not a Jev call."
            : ready && !apiKey
              ? "The stream is live. Paste a key to judge it. No decision is filled in until then."
              : "Round trip is the measured wait. Model time stays blank unless a timing header names model, inference, or jev. The wave is playback."}
          {estimate != null ? ` Estimate from input characters: ${formatRelayUsd(estimate)}.` : ""}
          {note ? ` ${note}` : ""}
        </p>
        <div className="mt-3 lg:hidden">
          <ExampleCard examples={examples} live={cells.slice(0, 3)} mock={mock} showFlips={flips.flipped > 0} />
        </div>
      </footer>
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.14em] text-[#efeae0]/70">
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 border border-[#fff8f2] bg-[#ff3b1f]" />
        Flipped
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 bg-[#173628]" />
        Unchanged
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 bg-[#1a1814]" />
        Not yet
      </li>
    </ul>
  );
}

function ExampleCard({
  examples,
  live,
  showFlips,
  mock,
}: {
  examples: Slot[];
  live: Slot[];
  showFlips: boolean;
  mock: boolean;
}) {
  if (showFlips) {
    return (
      <div className="rounded-md border border-white/10 bg-[#14120f]/92 p-3 backdrop-blur-sm" data-testid="relay-examples">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/50">Rows that changed</p>
        <ul className="mt-2 space-y-2.5">
          {examples.map((slot) => (
            <li key={slot.edit.id}>
              <p className="truncate text-sm">{slot.edit.title}</p>
              <p className="truncate text-xs text-[#efeae0]/50">
                {slot.edit.wiki} · {slot.edit.summary || "No summary"}
              </p>
              <p className="mono mt-0.5 text-[11px] uppercase tracking-[0.12em]">
                <ActionName action={slot.before} />
                <span className="px-1.5 text-[#efeae0]/40">→</span>
                <ActionName action={slot.after} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-white/10 bg-[#14120f]/92 p-3 backdrop-blur-sm" data-testid="relay-live">
      <p className="mono text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/50">
        Latest edits{mock ? " · local read" : ""}
      </p>
      <ul className="mt-2 space-y-2.5">
        {live.map((slot) => (
          <li data-testid="relay-live-row" key={slot.edit.id}>
            <p className="truncate text-sm">{slot.edit.title}</p>
            <p className="truncate text-xs text-[#efeae0]/50">
              {slot.edit.wiki} · {slot.edit.summary || "No summary"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionName({ action }: { action: RelayAction | null }) {
  const color = action === "revert" ? "#ff3b1f" : action === "review" ? "#e2a23a" : action === "keep" ? "#3dba7a" : "#efeae0";
  return <span style={{ color }}>{action ?? "—"}</span>;
}

function Stat({ label, value, testId, count }: { label: string; value: string; testId?: string; count?: number }) {
  return (
    <div data-count={count} data-testid={testId}>
      <dt className="mono inline text-[10px] uppercase tracking-[0.14em] text-[#efeae0]/40">{label} </dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}

function pickExamples(cells: readonly Slot[], revealed: number): Slot[] {
  const found: Slot[] = [];
  const end = Math.min(cells.length, revealed);
  for (let index = 0; index < end; index += 1) {
    const slot = cells[index];
    if (!slot?.before || !slot.after || slot.before === slot.after) continue;
    found.push(slot);
  }
  if (found.length <= 4) return found;
  const picks = [0, 0.33, 0.66, 0.9].map((t) => found[Math.min(found.length - 1, Math.floor(t * found.length))]!);
  const unique: Slot[] = [];
  const seen = new Set<string>();
  for (const slot of picks) {
    if (seen.has(slot.edit.id)) continue;
    seen.add(slot.edit.id);
    unique.push(slot);
  }
  return unique;
}

function formatMs(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 10) return `${value.toFixed(1)} ms`;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function spendText(summary: RelaySummary): string {
  if (summary.decisions === 0 || summary.unpriced === summary.decisions) return "—";
  return formatRelayUsd(summary.spendUsd);
}

function errorText(error: unknown): string {
  if (error instanceof JevCallError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "The re-judge was cancelled.";
  if (error instanceof Error) return error.message;
  return "The re-judge stopped.";
}
