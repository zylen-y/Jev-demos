import { JevCallError, messageForStatus } from "./errors";
import { parseSystemOneResponse } from "./parse";
import type { ModelCard, SystemOneRequest, SystemOneResponse } from "./types";

export type PostedCall = {
  response: SystemOneResponse;
  latencyMs: number;
  upstreamMs: number | null;
  modelMs: number | null;
};

export async function postSystemOne(options: {
  apiKey: string;
  request: SystemOneRequest;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<PostedCall> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new JevCallError(401, "Add a Jev API key before running this demo.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (options.timeoutMs != null) headers["x-atlas-timeout-ms"] = String(options.timeoutMs);
  if (options.maxRetries != null) headers["x-atlas-max-retries"] = String(options.maxRetries);
  const started = typeof performance === "undefined" ? Date.now() : performance.now();
  let response: Response;
  try {
    response = await fetchImpl(options.endpoint ?? "/api/jev", {
      method: "POST",
      headers,
      body: JSON.stringify(options.request),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new JevCallError(499, "The call was cancelled.");
    }
    throw new JevCallError(503, "Could not reach the demo proxy.");
  }
  const latencyMs = (typeof performance === "undefined" ? Date.now() : performance.now()) - started;
  const payload = await readJson(response);
  if (!response.ok) {
    throw new JevCallError(response.status, messageForStatus(response.status, payload));
  }
  return {
    response: parseSystemOneResponse(payload),
    latencyMs,
    upstreamMs: headerMs(response, "x-atlas-upstream-ms"),
    modelMs: headerMs(response, "x-atlas-model-ms"),
  };
}

function headerMs(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function postModels(options: {
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ModelCard[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/models", {
    headers: { Authorization: `Bearer ${options.apiKey.trim()}` },
    signal: options.signal,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new JevCallError(response.status, messageForStatus(response.status, payload));
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { models?: unknown }).models)) {
    throw new JevCallError(500, "The model list was not in the expected shape.");
  }
  return (payload as { models: ModelCard[] }).models;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: "The proxy returned a response that was not JSON." };
  }
}
