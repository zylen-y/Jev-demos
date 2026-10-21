import type { JudgedRow } from "./judge";

export type RelayCensus = {
  total: number;
  /** Rows the wave has resolved from the top. flipped + unchanged + failed. */
  shown: number;
  flipped: number;
  unchanged: number;
  failed: number;
  /** Rows the wave has not resolved. */
  waiting: number;
  /** Rows with a baseline or a new decision. */
  decided: number;
};

/**
 * Every on-screen counter reads this. `shown` stops at the first unresolved row,
 * so a later result cannot be counted while an earlier gap is still open.
 */
export function relayCensus(rows: readonly JudgedRow[], revealed: number): RelayCensus {
  const limit = Math.min(rows.length, Math.max(0, Math.floor(revealed)));
  let flipped = 0;
  let unchanged = 0;
  let failed = 0;
  let decided = 0;
  let stopped = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      stopped = true;
      continue;
    }
    if (row.before != null || row.after != null) decided += 1;
    if (stopped || index >= limit) continue;
    if (row.failed && (row.before == null || row.after == null)) {
      failed += 1;
      continue;
    }
    if (row.before == null || row.after == null) {
      stopped = true;
      continue;
    }
    if (row.before === row.after) unchanged += 1;
    else flipped += 1;
  }
  const shown = flipped + unchanged + failed;
  return {
    total: rows.length,
    shown,
    flipped,
    unchanged,
    failed,
    waiting: rows.length - shown,
    decided,
  };
}

export function censusAddsUp(census: RelayCensus): boolean {
  return census.flipped + census.unchanged + census.failed === census.shown && census.shown + census.waiting === census.total;
}

export type RelayReadout = {
  sweeping: boolean;
  /** Big figure: judged rows before a sweep, flipped rows during one. */
  headline: number;
  unchanged: number;
  /** The "X" in "X of N". Same number as `decisions`. */
  progress: number;
  /** Footer decision count. The revealed prefix while a sweep is on screen. */
  decisions: number;
  total: number;
};

/**
 * Every counter on the stage. During a sweep the footer, the "of" count, and
 * flipped + unchanged + failed are one number, so they cannot disagree.
 */
export function relayReadout(census: RelayCensus, sweeping: boolean): RelayReadout {
  const progress = sweeping ? census.shown : census.decided;
  return {
    sweeping,
    headline: sweeping ? census.flipped : census.decided,
    unchanged: census.unchanged,
    progress,
    decisions: progress,
    total: census.total,
  };
}

export function readoutAddsUp(census: RelayCensus, readout: RelayReadout): boolean {
  if (!censusAddsUp(census) || readout.decisions !== readout.progress || readout.total !== census.total) return false;
  if (readout.sweeping) return readout.headline + census.unchanged + census.failed === readout.decisions;
  return readout.headline === census.decided && readout.decisions === census.decided;
}

/** Stream edits stay off a frozen grid so a finished wave cannot be pushed down. */
export function placeStreamEdit<T>(grid: readonly T[], incoming: readonly T[], edit: T, frozen: boolean, cap: number): { grid: T[]; incoming: T[] } {
  if (frozen) return { grid: [...grid], incoming: [edit, ...incoming].slice(0, 8) };
  return { grid: [edit, ...grid].slice(0, cap), incoming: [...incoming] };
}
