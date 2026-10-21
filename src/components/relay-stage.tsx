"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKey } from "@/components/key-context";
import { postSystemOne } from "@/lib/jev/browser";
import { costUsd } from "@/lib/jev/cost";
import { JevCallError } from "@/lib/jev/errors";
import { judgeEdits, type BurstItem } from "@/lib/relay/burst";
import { placeStreamEdit, relayCensus, relayReadout } from "@/lib/relay/census";
import {
  actionFromAnswers,
  actionFromIncoming,
  applyAddedClause,
  DEFAULT_POLICY,
  incomingClauseRequest,
  isAddedClause,
  mockAction,
  mockClauseApplies,
  mockCurrent,
  MOCK_PLAYBACK_MS,
  readyPrefix,
  RECORD_POLICY,
  relayRequest,
  type RelayAction,
} from "@/lib/relay/judge";
import { metricDataAttributes, spendFromSummary, type MetricReading } from "@/lib/relay/metrics";
import { columnsFor, paintRelayField } from "@/lib/relay/paint";
import { formatRelayCents, formatRelayUsd, percentile, summarizeRelay, type RelaySample, type RelaySummary } from "@/lib/relay/stats";
import { countRuleReverts, isStoryStep, pickRuleFlips, pickShowcase, sampleVerdict, storyCaption, type StoryStep } from "@/lib/relay/story";
import { backfillWikipedia, editFromEvent, RELAY_BACKLOG, WIKI_STREAM_URL, type WikiEdit } from "@/lib/relay/wiki";
import type { JudgedRow } from "@/lib/relay/judge";

type Slot = JudgedRow & { edit: WikiEdit };
type Sample = RelaySample & { modelMs: number | null };
type Phase = "loading" | "ready" | "armed" | "judging" | "playing" | "done";
type Incoming = { edit: WikiEdit; action: RelayAction | null };

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

const CARD_DELAY_MS = 4_000;

export function RelayStage() {
  const params = useSearchParams();
  const mock = params.get("mock") === "1";
  const waveScene = params.get("scene") === "wave";
  const hold = params.get("hold") === "1";
  const autostart = params.get("autostart") === "1";
  const present = params.get("present") === "1";
  const { apiKey, ready, open } = useKey();

  const [policy, setPolicy] = useState(waveScene ? RECORD_POLICY : DEFAULT_POLICY);
  const [cells, setCells] = useState<Slot[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [held, setHeld] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [revealed, setRevealed] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [streamOn, setStreamOn] = useState(false);
  const [streamStatus, setStreamStatus] = useState<"idle" | "open" | "reconnecting">("idle");
  const [arrived, setArrived] = useState(0);
  const [localPassMs, setLocalPassMs] = useState<number | null>(null);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const [baselineSettled, setBaselineSettled] = useState(mock);
  const [showCard, setShowCard] = useState(false);
  const [measured, setMeasured] = useState<MetricReading | null>(null);
  const [ledger, setLedger] = useState({ stream: EMPTY_SUMMARY, rejudge: EMPTY_SUMMARY, modelP50: null as number | null });
  const [storyStep, setStoryStep] = useState<StoryStep | null>(null);

  const cellsRef = useRef<Slot[]>([]);
  const revealedRef = useRef(0);
  const paintedRef = useRef(0);
  const playRef = useRef(false);
  const frozenRef = useRef(false);
  const liveWaveRef = useRef(false);
  const judgingDoneRef = useRef(false);
  const seenRef = useRef(new Set<string>());
  const committedRef = useRef(DEFAULT_POLICY);
  const policyRef = useRef(policy);
  const mockRef = useRef(mock);
  const apiKeyRef = useRef(apiKey);
  const waveSceneRef = useRef(waveScene);
  const phaseRef = useRef(phase);
  const beginWaveRef = useRef(() => {});
  const runRejudgeRef = useRef<(signal?: AbortSignal) => Promise<void>>(async () => {});
  const takeEditRef = useRef<(edit: WikiEdit) => void>(() => {});
  const startBaselineRef = useRef(() => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const patchesRef = useRef(new Map<string, Partial<Slot>>());
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamSamplesRef = useRef<Sample[]>([]);
  const rejudgeSamplesRef = useRef<Sample[]>([]);
  const incomingRef = useRef<Incoming[]>([]);
  const incomingPolicyRef = useRef(DEFAULT_POLICY);
  const abortRef = useRef<AbortController | null>(null);
  const baselineAbortRef = useRef<AbortController | null>(null);
  const baselineRunRef = useRef(false);
  const markChangesRef = useRef(false);
  const aliveRef = useRef(true);
  const openRef = useRef(open);

  const sceneKey = `${String(mock)}:${String(waveScene)}:${String(hold)}:${String(present)}`;
  const [sceneKeySeen, setSceneKeySeen] = useState(sceneKey);
  if (sceneKeySeen !== sceneKey) {
    setSceneKeySeen(sceneKey);
    setPhase("loading");
    setCells([]);
    setIncoming([]);
    setHeld(0);
    setRevealed(0);
    setBanner(null);
    setStreamOn(false);
    setShowCard(false);
    setStoryStep(null);
    setBaselineSettled(mock);
    setWallMs(null);
    setMeasured(null);
  }

  function publishLedger() {
    const stream = summarizeRelay(streamSamplesRef.current);
    const rejudge = summarizeRelay(rejudgeSamplesRef.current);
    const source = rejudgeSamplesRef.current.some((sample) => sample.modelMs != null) ? rejudgeSamplesRef.current : streamSamplesRef.current;
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
    }, 40);
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
    if (reduce) {
      const total = cellsRef.current.length;
      revealedRef.current = total;
      paintedRef.current = total;
      setRevealed(total);
      playRef.current = false;
      setPhase("done");
      return;
    }
    paintedRef.current = 0;
    revealedRef.current = 0;
    setRevealed(0);
    playRef.current = true;
    setPhase("playing");
  }

  function takeEdit(edit: WikiEdit) {
    if (seenRef.current.has(edit.id)) return;
    seenRef.current.add(edit.id);
    if (frozenRef.current) {
      incomingRef.current = [{ edit, action: null }, ...incomingRef.current].slice(0, 8);
      setIncoming(incomingRef.current);
      setHeld((count) => count + 1);
      void judgeIncoming(edit);
      return;
    }
    const slot: Slot = {
      edit,
      before: mockRef.current ? mockCurrent(edit, committedRef.current) : null,
      after: null,
    };
    const placed = placeStreamEdit(cellsRef.current, [] as Slot[], slot, false, RELAY_BACKLOG);
    cellsRef.current = placed.grid;
    setCells(placed.grid);
    setArrived((count) => count + 1);
    if (!mockRef.current && apiKeyRef.current && slot.before == null) void judgeOne(slot, "before", committedRef.current, "stream");
  }

  async function judgeIncoming(edit: WikiEdit) {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const policy = incomingPolicyRef.current;
      const call = await postSystemOne({
        apiKey: key,
        request: isAddedClause(policy) ? incomingClauseRequest(edit, policy) : relayRequest(edit, policy),
        timeoutMs: 8000,
        maxRetries: 2,
        signal: abortRef.current?.signal,
      });
      const action = isAddedClause(policy) ? actionFromIncoming(call.response.answers) : actionFromAnswers(call.response.answers);
      incomingRef.current = incomingRef.current.map((item) => (item.edit.id === edit.id ? { ...item, action } : item));
      setIncoming(incomingRef.current);
    } catch {
      /* a held edit can stay unlabeled; it is not part of the grid */
    }
  }

  async function judgeOne(slot: Slot, field: "before" | "after", policyText: string, bucket: "stream" | "rejudge") {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const call = await postSystemOne({
        apiKey: key,
        request: relayRequest(slot.edit, policyText),
        timeoutMs: 8000,
        maxRetries: 2,
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

  function applyBurst(field: "before" | "after", bucket: "stream" | "rejudge", item: BurstItem) {
    if (item.failed) {
      queuePatch(item.id, { failed: true });
      if (aliveRef.current) setNote(item.error);
      return;
    }
    (bucket === "rejudge" ? rejudgeSamplesRef : streamSamplesRef).current.push(item.hit.sample);
    queuePatch(item.id, { [field]: item.hit.action, failed: false });
  }

  function startBaseline() {
    if (mockRef.current || frozenRef.current || baselineRunRef.current || !apiKeyRef.current) return;
    const jobs = cellsRef.current.filter((slot) => slot.before == null && !slot.failed).map((slot) => ({ id: slot.edit.id, edit: slot.edit }));
    if (jobs.length === 0) {
      if (cellsRef.current.length > 0) setBaselineSettled(true);
      return;
    }
    baselineRunRef.current = true;
    const controller = new AbortController();
    baselineAbortRef.current = controller;
    void judgeEdits({
      apiKey: apiKeyRef.current,
      jobs,
      policy: DEFAULT_POLICY,
      signal: controller.signal,
      onItem: (item) => applyBurst("before", "stream", item),
    })
      .then(() => {
        if (aliveRef.current) setBaselineSettled(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !aliveRef.current) return;
        setBaselineSettled(true);
        setNote(errorText(error));
      });
  }

  async function runRejudge(signal?: AbortSignal) {
    if (playRef.current || liveWaveRef.current || phaseRef.current === "judging" || cellsRef.current.length === 0) return;
    if (!mockRef.current && !apiKeyRef.current) {
      openRef.current();
      return;
    }
    const policyText = policyRef.current.trim();
    if (!policyText) return;
    frozenRef.current = true;
    incomingPolicyRef.current = policyText;
    baselineAbortRef.current?.abort();
    setNote(null);
    setShowCard(false);
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
        const next = snapshot.map((slot) => {
          const standing = slot.before ?? mockAction(slot.edit, DEFAULT_POLICY);
          return {
            ...slot,
            before: standing,
            after: isAddedClause(policyText) ? applyAddedClause(standing, mockClauseApplies(slot.edit, policyText)) : mockAction(slot.edit, policyText),
          };
        });
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
      liveWaveRef.current = true;
      judgingDoneRef.current = false;
      revealedRef.current = 0;
      paintedRef.current = 0;
      setRevealed(0);
      setPhase("playing");
      const missingBefore = snapshot.filter((slot) => slot.before == null).map((slot) => ({ id: slot.edit.id, edit: slot.edit }));
      if (missingBefore.length > 0) {
        await judgeEdits({
          apiKey: apiKeyRef.current,
          jobs: missingBefore,
          policy: committedRef.current,
          signal: linked,
          onItem: (item) => applyBurst("before", "stream", item),
        });
        flushPatches();
      }
      await judgeEdits({
        apiKey: apiKeyRef.current,
        jobs: cellsRef.current.map((slot) => ({ id: slot.edit.id, edit: slot.edit })),
        policy: policyText,
        kind: isAddedClause(policyText) ? "clause" : "standing",
        standingOf: (id) => cellsRef.current.find((slot) => slot.edit.id === id)?.before ?? null,
        signal: linked,
        onItem: (item) => applyBurst("after", "rejudge", item),
      });
      flushPatches();
      for (const slot of cellsRef.current) {
        if (slot.after == null && !slot.failed) queuePatch(slot.edit.id, { failed: true });
      }
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
      judgingDoneRef.current = true;
      if (readyPrefix(cellsRef.current) >= cellsRef.current.length) {
        liveWaveRef.current = false;
        revealedRef.current = cellsRef.current.length;
        setRevealed(cellsRef.current.length);
        setPhase("done");
      }
    } catch (error) {
      liveWaveRef.current = false;
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
    takeEditRef.current = takeEdit;
    runRejudgeRef.current = runRejudge;
    startBaselineRef.current = startBaseline;
    markChangesRef.current = present && (phase === "playing" || phase === "done");
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
            markChanges: markChangesRef.current,
          });
        }
      }
      if (liveWaveRef.current) {
        const ready = readyPrefix(cellsRef.current);
        if (ready !== revealedRef.current) {
          revealedRef.current = ready;
          paintedRef.current = ready;
          lastPublish = now;
          setRevealed(ready);
        }
        if (judgingDoneRef.current && cellsRef.current.length > 0 && ready >= cellsRef.current.length) {
          liveWaveRef.current = false;
          setPhase("done");
        }
      } else if (playRef.current) {
        const total = cellsRef.current.length;
        const ready = readyPrefix(cellsRef.current);
        const dt = Math.min(48, Math.max(0, now - last));
        const rate = total > 0 ? total / MOCK_PLAYBACK_MS : 0;
        paintedRef.current = Math.min(ready, paintedRef.current + dt * rate);
        const next = Math.floor(paintedRef.current);
        revealedRef.current = next;
        const finished = total > 0 && next >= total && ready >= total;
        if (finished || now - lastPublish > 60) {
          lastPublish = now;
          setRevealed(next);
          if (finished) {
            playRef.current = false;
            setPhase("done");
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
      baselineAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!present) return;
    const onStory = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "string" && isStoryStep(detail)) setStoryStep(detail);
    };
    window.addEventListener("relay-story", onStory);
    return () => window.removeEventListener("relay-story", onStory);
  }, [present]);

  useEffect(() => {
    if (phase !== "done" || !present || storyStep != null) return;
    const timer = setTimeout(() => setShowCard(true), CARD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, present, storyStep]);

  useEffect(() => {
    let cancel = false;
    baselineAbortRef.current?.abort();
    baselineRunRef.current = false;
    frozenRef.current = false;
    liveWaveRef.current = false;
    cellsRef.current = [];
    incomingRef.current = [];
    seenRef.current = new Set();
    backfillWikipedia(RELAY_BACKLOG)
      .then((edits) => {
        if (cancel) return;
        const slots: Slot[] = edits.map((edit) => ({
          edit,
          before: mock ? mockAction(edit, DEFAULT_POLICY) : null,
          after: mock && waveScene ? applyAddedClause(mockAction(edit, DEFAULT_POLICY), mockClauseApplies(edit, RECORD_POLICY)) : null,
        }));
        for (const slot of slots) seenRef.current.add(slot.edit.id);
        cellsRef.current = slots;
        setCells(slots);
        if (slots.length === 0) {
          setBanner("Wikipedia did not return recent changes.");
          setPhase("ready");
          setBaselineSettled(true);
          return;
        }
        if (mock && waveScene) committedRef.current = RECORD_POLICY;
        if (mock && waveScene && hold) setPhase("armed");
        else if (mock && waveScene) beginWaveRef.current();
        else {
          setPhase("ready");
          if (!waveScene) setStreamOn(true);
          startBaselineRef.current();
        }
      })
      .catch(() => {
        if (cancel) return;
        setBanner("Could not reach English Wikipedia for the backlog.");
        setPhase("ready");
        setBaselineSettled(true);
      });
    return () => {
      cancel = true;
    };
  }, [hold, mock, waveScene]);

  useEffect(() => {
    startBaselineRef.current();
  }, [apiKey, mock, cells.length]);

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

  const census = relayCensus(cells, revealed);
  const activeSummary = ledger.rejudge.decisions > 0 ? ledger.rejudge : ledger.stream;
  const examples = useMemo(() => pickRuleFlips(cells, revealed, 4), [cells, revealed]);
  const showcase = useMemo(() => pickShowcase(cells, cells.length, 3), [cells]);
  const verdictSample = useMemo(() => sampleVerdict(cells), [cells]);
  const sweeping = phase === "playing" || phase === "done";
  const readout = relayReadout(census, sweeping);
  const ruleReverts = useMemo(() => countRuleReverts(cells, revealed), [cells, revealed]);
  const otherChanges = Math.max(0, census.flipped - ruleReverts);
  const showRuleCount = present && sweeping;
  const headlineLabel = showRuleCount ? "Reverted" : sweeping ? "Flipped" : "Judged";
  const headlineValue = showRuleCount ? ruleReverts : readout.headline;
  const telling = present && storyStep != null;
  const showCounter = !telling || storyStep === "wave";
  const showSidebar = !telling || storyStep === "wave";

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
  const rejudgeSpend =
    mock || ledger.rejudge.decisions === 0 || ledger.rejudge.unpriced === ledger.rejudge.decisions ? null : formatRelayUsd(ledger.rejudge.spendUsd);
  const cardTime = mock ? `${(MOCK_PLAYBACK_MS / 1000).toFixed(1)} s playback` : wallMs != null ? formatMs(wallMs) : null;
  const cardSpend = !mock && measured?.spendUsd != null ? formatRelayCents(measured.spendUsd) : null;
  const cardOpen = Boolean(cardTime && (storyStep === "card" || showCard));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#100e0c] text-[#efeae0]"
      data-backlog={census.total}
      data-baseline={baselineSettled ? "1" : "0"}
      data-decided={census.decided}
      data-flipped={census.flipped}
      data-mock={mock ? "1" : "0"}
      data-phase={phase}
      data-present={present ? "1" : "0"}
      data-other={otherChanges}
      data-reverts={ruleReverts}
      data-settled={phase === "done" && census.total > 0 && census.shown >= census.total ? "1" : "0"}
      data-shown={census.shown}
      data-story={storyStep ?? ""}
      data-testid="relay-stage"
      data-unchanged={census.unchanged}
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
          {present ? null : (
            <p className="mono hidden text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/55 md:block" data-testid="relay-stream">
              {streamLabel}
            </p>
          )}
          {!present && held > 0 ? (
            <p className="mono text-[11px] uppercase tracking-[0.14em] text-[#efeae0]/70" data-count={held} data-testid="relay-incoming">
              {held.toLocaleString()} new, held off the grid
            </p>
          ) : null}
          {mock ? (
            <p className="bg-[#e23b16] px-3 py-1.5 text-sm font-semibold tracking-[0.22em] text-white">MOCKED</p>
          ) : present ? null : (
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/70">{ready && apiKey ? "Key in this browser" : "No key yet"}</p>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0" data-state={phase} data-testid="relay-wave">
          <canvas aria-hidden="true" className="h-full w-full" ref={canvasRef} />
        </div>
        <div className="pointer-events-none absolute left-0 top-0 h-64 w-[min(100%,28rem)] bg-gradient-to-br from-[#100e0c] via-[#100e0c]/82 to-transparent" />
        {showCounter ? (
          <div className={`pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6 ${present ? "max-w-xs sm:left-8 sm:top-6" : ""}`}>
            <p className={`mono uppercase text-[#efeae0]/60 ${present ? "text-sm tracking-[0.18em]" : "text-[11px] tracking-[0.2em]"}`}>{headlineLabel}</p>
            <p
              className={`serif leading-none ${headlineValue > 0 ? "text-[#ff3b1f]" : "text-[#efeae0]"} ${present ? "text-7xl" : "text-6xl sm:text-7xl lg:text-8xl"}`}
              data-count={headlineValue}
              data-testid="relay-flips"
            >
              {headlineValue.toLocaleString()}
            </p>
            {showRuleCount ? <p className="mt-2 text-xl text-[#efeae0]/80">by the new rule</p> : null}
            <p className={`mt-2 text-[#efeae0]/75 ${present ? "text-xl" : "text-sm"}`}>
              {sweeping ? `${readout.unchanged.toLocaleString()} unchanged` : "baseline"}
              {sweeping ? (
                <span data-count={otherChanges} data-testid="relay-other">
                  {` · ${otherChanges.toLocaleString()} other changes`}
                </span>
              ) : null}
              {census.failed > 0 ? ` · ${census.failed.toLocaleString()} failed` : ""}
              <span className={`mono ml-3 uppercase ${present ? "text-sm tracking-[0.12em]" : "text-[11px] tracking-[0.14em]"}`} data-count={readout.progress} data-testid="relay-revealed">
                {readout.progress.toLocaleString()} of {readout.total.toLocaleString()}
              </span>
            </p>
            {present && sweeping ? <WaveLegend /> : <Legend />}
          </div>
        ) : (
          <p className="sr-only" data-count={headlineValue} data-testid="relay-flips">
            {headlineValue.toLocaleString()}
          </p>
        )}
        {storyStep && storyStep !== "examples" && storyStep !== "card" ? <StoryBanner step={storyStep} total={census.total} /> : null}
        {storyStep === "stream" ? <StreamPanel rows={cells.slice(0, 4)} /> : null}
        {storyStep === "judge" ? <JudgePanel sample={verdictSample} /> : null}
        {storyStep === "examples" ? <ShowcasePanel rows={showcase} total={census.total} /> : null}
        {showSidebar ? (
          <aside className={`absolute bottom-4 right-4 hidden lg:block ${present ? "w-[32rem]" : "w-[340px]"}`}>
            <ExampleCard examples={examples} incoming={incoming} live={cells.slice(0, 5)} mock={mock} present={present} showFlips={examples.length > 0} />
          </aside>
        ) : null}
        {phase === "loading" ? (
          <p className="absolute inset-x-0 top-1/2 text-center text-sm text-[#efeae0]/70">Pulling the last {RELAY_BACKLOG.toLocaleString()} English Wikipedia edits…</p>
        ) : null}
        {banner ? <p className="absolute inset-x-6 top-1/2 text-center text-sm text-[#efeae0]">{banner}</p> : null}
        {cardOpen ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#100e0c]/94 px-8" data-testid="relay-stat-card">
            <div className="max-w-5xl rounded-3xl bg-[#100e0c] px-10 py-12">
              <p className="serif text-center text-5xl leading-tight sm:text-7xl">
                {census.total.toLocaleString()} edits
                <span className="text-[#efeae0]/35"> · </span>
                {cardTime}
                {cardSpend ? (
                  <>
                    <span className="text-[#efeae0]/35"> · </span>
                    {cardSpend}
                  </>
                ) : null}
              </p>
              <p className="mx-auto mt-8 max-w-3xl text-center text-2xl leading-snug text-[#efeae0]/80 sm:text-3xl">
                What a policy change would have done, before you ship it.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-white/10 bg-[#14120f] px-4 py-3 sm:px-5">
        {policy.trim() !== DEFAULT_POLICY.trim() ? (
          <p className={`mb-2 leading-snug text-[#efeae0]/75 ${present ? "text-lg" : "text-xs"}`} data-testid="relay-standing">
            <span className={`mono mr-2 uppercase text-[#efeae0]/50 ${present ? "text-sm tracking-[0.14em]" : "text-[11px] tracking-[0.16em]"}`}>Standing policy</span>
            {DEFAULT_POLICY}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-0 flex-1 text-sm" htmlFor="relay-policy">
            <span className={`mono mb-1.5 block uppercase text-[#efeae0]/50 ${present ? "text-sm tracking-[0.14em]" : "text-[11px] tracking-[0.16em]"}`}>
              {policy.trim() === DEFAULT_POLICY.trim() ? "Policy" : "Added clause"}
            </span>
            <textarea
              className={`w-full resize-none rounded-md border border-white/15 bg-[#0c0b09] px-3 py-2 leading-snug text-[#efeae0] ${present ? "h-28 text-[1.7rem]" : "h-16 text-sm leading-5"} ${storyStep === "change" ? "ring-2 ring-[#ff3b1f]" : ""}`}
              data-testid="relay-policy"
              id="relay-policy"
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
            className={`shrink-0 rounded-md bg-[#e23b16] font-medium text-white disabled:opacity-50 ${present ? "h-28 px-8 text-2xl" : "h-12 px-5 text-sm lg:h-16"}`}
            data-testid="relay-rejudge"
            disabled={busy || cells.length === 0 || policy.trim() === ""}
            onClick={onRejudge}
            type="button"
          >
            {phase === "playing" ? "Sweeping" : phase === "judging" ? "Judging" : "Re-judge the backlog"}
          </button>
        </div>
        <dl className={`mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[#efeae0]/80 ${present ? "text-lg" : "text-xs"}`}>
          <Stat count={readout.decisions} label="Decisions" testId="relay-decisions" value={readout.decisions.toLocaleString()} />
          <MaybeStat label="Round trip p50" value={activeSummary.p50RoundTripMs == null ? null : formatMs(activeSummary.p50RoundTripMs)} />
          <MaybeStat label="Upstream p50" value={activeSummary.p50UpstreamMs == null ? null : formatMs(activeSummary.p50UpstreamMs)} />
          <MaybeStat label="Model p50" value={ledger.modelP50 == null ? null : formatMs(ledger.modelP50)} />
          <MaybeStat label="Re-judge" value={wallMs != null ? formatMs(wallMs) : localPassMs != null ? `${formatMs(localPassMs)} local` : null} />
          <MaybeStat label="Wave" value={mock && (phase === "playing" || phase === "done") ? `${(MOCK_PLAYBACK_MS / 1000).toFixed(1)} s playback` : null} />
          <MaybeStat label="Re-judge spend" testId="relay-spend" value={rejudgeSpend} />
        </dl>
        <p className={`mt-2 leading-4 text-[#efeae0]/45 ${present ? "text-sm" : "text-[11px]"} ${telling ? "sr-only" : ""}`}>
          {mock
            ? "Mocked decisions, measured on this page. Wikipedia edits are live. This is not a Jev call. The sweep is playback."
            : ready && !apiKey
              ? "The stream is live. Paste a key to judge it. No decision is filled in until then."
              : "Cells flip as each decision lands. Re-judge time is the wall clock. Spend is the summed reported input tokens."}
          {note ? ` ${note}` : ""}
        </p>
        <div className="mt-3 lg:hidden">
          <ExampleCard examples={examples} incoming={incoming} live={cells.slice(0, 3)} mock={mock} present={present} showFlips={census.flipped > 0} />
        </div>
      </footer>
    </div>
  );
}

function StoryBanner({ step, total }: { step: StoryStep; total: number }) {
  const copy = storyCaption(step, total);
  return (
    <div
      className={`pointer-events-none absolute z-20 flex justify-center px-6 ${step === "wave" ? "left-[24rem] right-6 top-4" : "inset-x-0 top-4"}`}
      data-step={step}
      data-testid="relay-caption"
    >
      <div className="w-full max-w-5xl rounded-2xl border border-white/15 bg-[#100e0c] px-8 py-6 shadow-[0_16px_50px_rgba(0,0,0,0.65)]">
        <p className="serif text-center text-4xl leading-tight sm:text-5xl">{copy.title}</p>
        {copy.detail ? <p className="mt-3 text-center text-2xl text-[#efeae0]/80">{copy.detail}</p> : null}
      </div>
    </div>
  );
}

function StreamPanel({ rows }: { rows: Slot[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 top-64 z-10 flex justify-center px-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-[#14120f] px-8 py-6 shadow-[0_16px_50px_rgba(0,0,0,0.55)]">
        <p className="mono text-sm uppercase tracking-[0.16em] text-[#efeae0]/55">Live right now</p>
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((slot) => (
            <li className="min-w-0" key={slot.edit.id}>
              <p className="truncate font-sans text-3xl leading-tight">{slot.edit.title}</p>
              <p className="truncate text-lg text-[#efeae0]/50">
                {slot.edit.wiki} · {slot.edit.summary || "No summary"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function JudgePanel({ sample }: { sample: Slot | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 top-64 z-10 flex justify-center px-6">
      <div className="flex w-full max-w-3xl flex-col justify-center rounded-2xl border border-white/15 bg-[#14120f] px-8 py-7 shadow-[0_16px_50px_rgba(0,0,0,0.55)]">
        <VerdictLegend />
        {sample ? (
          <div className="mt-8 min-w-0 border-t border-white/10 pt-6" data-testid="relay-example">
            <p className="truncate font-sans text-4xl leading-tight">{sample.edit.title}</p>
            <p className="mt-2 truncate text-lg text-[#efeae0]/50">{sample.edit.summary || sample.edit.wiki}</p>
            <p className="mono mt-3 text-2xl uppercase tracking-[0.14em]">
              <ActionName action={sample.before} />
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShowcasePanel({ rows, total }: { rows: Slot[]; total: number }) {
  const copy = storyCaption("examples", total);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#100e0c]/90 px-8" data-count={rows.length} data-testid="relay-highlights">
      <div className="w-full max-w-4xl">
        <div className="rounded-2xl border border-white/15 bg-[#100e0c] px-8 py-6">
          <p className="serif text-center text-4xl leading-tight sm:text-5xl">{copy.title}</p>
        </div>
        <ul className="mt-6 flex flex-col gap-4">
          {rows.map((slot) => (
            <li className="min-w-0 rounded-2xl border border-white/10 bg-[#14120f] px-8 py-5" key={slot.edit.id}>
              <p className="line-clamp-2 font-sans text-4xl leading-tight">{slot.edit.title}</p>
              <p className="mono mt-3 text-2xl uppercase tracking-[0.12em]">
                <ActionName action={slot.before} />
                <span className="px-2 text-[#efeae0]/40">→</span>
                <ActionName action={slot.after} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function VerdictLegend() {
  const items: { color: string; label: string }[] = [
    { color: "#1f8f52", label: "Keep" },
    { color: "#e2a23a", label: "Review" },
    { color: "#ff3b1f", label: "Revert" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-10 gap-y-4">
      {items.map((item) => (
        <li className="flex items-center gap-3 text-3xl" key={item.label}>
          <span className="inline-block h-8 w-8 rounded-sm" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function WaveLegend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm uppercase tracking-[0.14em] text-[#efeae0]/75">
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 bg-[#ff3b1f]" />
        Reverted by the rule
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 bg-[#4a403c]" />
        Other change
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 bg-[#173628]" />
        Unchanged
      </li>
    </ul>
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
        <span className="inline-block h-2 w-2 bg-[#1f8f52]" />
        Baseline
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
  incoming,
  live,
  showFlips,
  mock,
  present,
}: {
  examples: Slot[];
  incoming: Incoming[];
  live: Slot[];
  showFlips: boolean;
  mock: boolean;
  present: boolean;
}) {
  if (showFlips) {
    const toRevert = examples.some((slot) => slot.after === "revert" && slot.before != null && slot.before !== "revert");
    return (
      <div className="max-h-full overflow-hidden rounded-md border border-white/10 bg-[#14120f]/92 p-4 backdrop-blur-sm" data-testid="relay-examples">
        <p className={`mono uppercase text-[#efeae0]/50 ${present ? "text-sm tracking-[0.14em]" : "text-[11px] tracking-[0.16em]"}`}>
          {toRevert ? "Reverted by the new rule" : "Rows that changed"}
        </p>
        <ul className={`mt-3 flex flex-col ${present ? "gap-4" : "gap-3"}`}>
          {examples.map((slot) => (
            <li className="min-w-0 overflow-hidden" key={slot.edit.id}>
              <p className={`truncate leading-6 ${present ? "text-2xl" : "text-sm"}`}>{slot.edit.title}</p>
              <p className={`truncate text-[#efeae0]/50 ${present ? "text-base" : "text-xs"}`}>
                {slot.edit.wiki} · {slot.edit.summary || "No summary"}
              </p>
              <p className={`mono mt-1 whitespace-nowrap uppercase ${present ? "text-lg tracking-[0.12em]" : "text-[11px] tracking-[0.12em]"}`}>
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
  const rows = incoming.length > 0 ? incoming.slice(0, 4).map((item) => item.edit) : live.map((slot) => slot.edit);
  return (
    <div className="max-h-full overflow-hidden rounded-md border border-white/10 bg-[#14120f]/92 p-4 backdrop-blur-sm" data-testid="relay-live">
      <p className="mono text-[11px] uppercase tracking-[0.16em] text-[#efeae0]/50">{incoming.length > 0 ? "New, held off the grid" : `Latest edits${mock ? " · local read" : ""}`}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((edit) => (
          <li className="min-w-0 overflow-hidden" data-testid="relay-live-row" key={edit.id}>
            <p className="truncate text-sm leading-6">{edit.title}</p>
            <p className="truncate text-xs text-[#efeae0]/50">
              {edit.wiki} · {edit.summary || "No summary"}
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
      <dt className="mono inline uppercase tracking-[0.14em] text-[#efeae0]/40">{label} </dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}

function MaybeStat({ label, value, testId }: { label: string; value: string | null; testId?: string }) {
  if (value == null) return null;
  return <Stat label={label} testId={testId} value={value} />;
}

function formatMs(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 10) return `${value.toFixed(1)} ms`;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function errorText(error: unknown): string {
  if (error instanceof JevCallError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "The re-judge was cancelled.";
  if (error instanceof Error) return error.message;
  return "The re-judge stopped.";
}
