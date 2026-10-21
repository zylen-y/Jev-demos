"use client";

import { useCallback, useState } from "react";
import { useKey } from "@/components/key-context";
import { postSystemOne } from "@/lib/jev/browser";
import { costUsd, estimateTokens } from "@/lib/jev/cost";
import { JevCallError } from "@/lib/jev/errors";
import type { SystemOneRequest, SystemOneResponse, Usage } from "@/lib/jev/types";

export type CallRecord = {
  id: string;
  label: string;
  latencyMs: number;
  model: string;
  usage: Usage;
  costUsd: number | null;
  estimatedTokens: number;
};

export function useJev() {
  const { apiKey, open } = useKey();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const run = useCallback(
    async (
      systemRequest: SystemOneRequest,
      options?: { label?: string; timeoutMs?: number; maxRetries?: number; signal?: AbortSignal },
    ): Promise<SystemOneResponse> => {
      if (!apiKey) {
        open();
        throw new JevCallError(401, "Add a Jev API key before running this demo.");
      }
      setPending((count) => count + 1);
      setError(null);
      try {
        const posted = await postSystemOne({
          apiKey,
          request: systemRequest,
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
          maxRetries: options?.maxRetries,
        });
        const record: CallRecord = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          label: options?.label ?? "systemone",
          latencyMs: posted.latencyMs,
          model: posted.response.model,
          usage: posted.response.usage,
          costUsd: costUsd(posted.response.usage),
          estimatedTokens: estimateTokens(systemRequest),
        };
        setCalls((current) => [record, ...current].slice(0, 32));
        return posted.response;
      } catch (caught) {
        const message = caught instanceof JevCallError ? caught.message : "The Jev call failed.";
        if (!(caught instanceof JevCallError && caught.status === 499)) setError(message);
        throw caught;
      } finally {
        setPending((count) => Math.max(0, count - 1));
      }
    },
    [apiKey, open],
  );

  return {
    apiKey,
    run,
    calls,
    error,
    setError,
    pending: pending > 0,
    clear: () => {
      setCalls([]);
      setError(null);
    },
  };
}
