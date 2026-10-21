import { postSystemOneBatch } from "@/lib/jev/browser";
import { JEV_BURST_IN_FLIGHT } from "@/lib/jev/client";
import { costUsd } from "@/lib/jev/cost";
import { JevCallError } from "@/lib/jev/errors";
import { actionFromAnswers, relayRequest, type RelayAction } from "./judge";
import type { RelaySample } from "./stats";
import type { WikiEdit } from "./wiki";

export const RELAY_CHUNK = JEV_BURST_IN_FLIGHT;
export const RELAY_MAX_RETRIES = 2;

export type BurstJob = { id: string; edit: WikiEdit };

export type BurstHit = {
  action: RelayAction;
  sample: RelaySample & { modelMs: number | null };
};

export type BurstItem = { id: string } & ({ failed: false; hit: BurstHit } | { failed: true; status: number; error: string });

/** 429 and 529 are the documented backoff cases. Other errors are final. */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 529;
}

/** Exponential backoff. Attempt 0 is the first retry after a limited response. */
export function backoffMs(attempt: number): number {
  return Math.min(5_000, 400 * 2 ** Math.max(0, attempt));
}

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const width = Math.max(1, Math.floor(size));
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += width) groups.push(items.slice(index, index + width));
  return groups;
}

export async function judgeEdits(options: {
  apiKey: string;
  jobs: BurstJob[];
  policy: string;
  signal?: AbortSignal;
  onItem: (item: BurstItem) => void;
}): Promise<void> {
  for (const group of chunkItems(options.jobs, RELAY_CHUNK)) {
    if (options.signal?.aborted) throw new DOMException("The batch was cancelled.", "AbortError");
    let pending = group;
    for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
      if (attempt > 0) await waitMs(backoffMs(attempt - 1), options.signal);
      const results = await postSystemOneBatch({
        apiKey: options.apiKey,
        requests: pending.map((job) => relayRequest(job.edit, options.policy)),
        timeoutMs: 8_000,
        maxRetries: RELAY_MAX_RETRIES,
        signal: options.signal,
      });
      const again: BurstJob[] = [];
      results.forEach((result, index) => {
        const job = pending[index];
        if (!job) return;
        if (!result.ok && shouldRetryStatus(result.status) && attempt < 2) {
          again.push(job);
          return;
        }
        if (!result.ok) {
          options.onItem({ id: job.id, failed: true, status: result.status, error: result.error });
          return;
        }
        options.onItem({
          id: job.id,
          failed: false,
          hit: {
            action: actionFromAnswers(result.call.response.answers),
            sample: {
              roundTripMs: result.call.latencyMs,
              upstreamMs: result.call.upstreamMs,
              modelMs: result.call.modelMs,
              costUsd: costUsd(result.call.response.usage),
              inputTokens: result.call.response.usage.input_tokens,
            },
          },
        });
      });
      pending = again;
    }
  }
}

export function burstFailure(error: unknown): string {
  if (error instanceof JevCallError) return error.message;
  if (error instanceof Error) return error.message;
  return "The re-judge stopped.";
}

function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The batch was cancelled.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The batch was cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
