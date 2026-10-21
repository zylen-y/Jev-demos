/**
 * Server and CLI client. Uses the official `@typesafe-ai/sdk`.
 * Do not import this module from browser components — the key would ship to the page
 * through the SDK, and the browser talks to the same-origin proxy instead.
 */
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  TypeSafeClient,
  TypeSafeError,
  type SystemOneRequest as SdkRequest,
} from "@typesafe-ai/sdk";
import { createLimiter } from "../pool";
import { JevCallError, messageForStatus, redactSecret } from "./errors";
import { parseSystemOneResponse } from "./parse";
import type { ModelCard, SystemOneRequest, SystemOneResponse } from "./types";
import { DEFAULT_BASE_URL, JEV_MODEL } from "./types";

/**
 * In-flight cap for a relay burst. TypeSafe publishes per-organization token and
 * request limits, not a fixed rate. The SDK default client allows about 100
 * connections. 48 stays under that. 429 and 529 use the SDK backoff below.
 */
export const JEV_BURST_IN_FLIGHT = 48;

const burstGate = createLimiter(JEV_BURST_IN_FLIGHT);

export type EvaluateOptions = {
  apiKey: string;
  request: SystemOneRequest;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  baseURL?: string;
};

const modelTimes = new WeakMap<object, number | null>();

/** Model duration from a Jev timing header, when the response included one. */
export function modelMsFor(response: object): number | null {
  return modelTimes.get(response) ?? null;
}

export function modelTimeFromHeaders(headers: Headers): number | null {
  const serverTiming = headers.get("server-timing");
  if (serverTiming) {
    for (const part of serverTiming.split(",")) {
      const name = part.split(";")[0]?.trim().toLowerCase() ?? "";
      const match = /(?:^|;)\s*dur=(\d+(?:\.\d+)?)/i.exec(part);
      if (!match) continue;
      if (name === "model" || name === "inference" || name === "jev") {
        const value = Number(match[1]);
        if (Number.isFinite(value)) return value;
      }
    }
  }
  return null;
}

export type BatchItem = {
  status: number;
  body: unknown;
  upstreamMs: number | null;
  modelMs: number | null;
};

export async function evaluateSystemOne(options: EvaluateOptions): Promise<SystemOneResponse> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new JevCallError(401, "Add a Jev API key before running this demo.");
  }
  const client = openClient(options);
  try {
    return await runOne(client, options.request, options.signal, options.timeoutMs, options.maxRetries);
  } catch (error) {
    throw toJevCallError(error, apiKey);
  }
}

/** One shared client, many System One calls, capped by `JEV_BURST_IN_FLIGHT`. */
export async function evaluateSystemOneMany(options: Omit<EvaluateOptions, "request"> & { requests: SystemOneRequest[] }): Promise<BatchItem[]> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new JevCallError(401, "Add a Jev API key before running this demo.");
  }
  if (options.requests.length === 0) return [];
  const client = openClient(options);
  const retry = options.maxRetries == null ? undefined : { maxRetries: options.maxRetries };
  return Promise.all(
    options.requests.map(async (request) =>
      burstGate(async () => {
        if (options.signal?.aborted) throw new DOMException("The batch was cancelled.", "AbortError");
        const started = performance.now();
        try {
          const pending = client.systemOne(request as unknown as SdkRequest, {
            signal: options.signal,
            timeout: options.timeoutMs,
            retry,
          });
          const wrapped = await pending.withResponse();
          const response = parseSystemOneResponse(wrapped.data);
          const modelMs = modelTimeFromHeaders(wrapped.response.headers);
          modelTimes.set(response, modelMs);
          return { status: 200, body: response, upstreamMs: performance.now() - started, modelMs };
        } catch (error) {
          if (options.signal?.aborted) throw toJevCallError(error, apiKey);
          const mapped = toJevCallError(error, apiKey);
          return { status: mapped.status, body: { error: mapped.message }, upstreamMs: performance.now() - started, modelMs: null };
        }
      }),
    ),
  );
}

function openClient(options: Omit<EvaluateOptions, "request">): TypeSafeClient {
  return new TypeSafeClient({
    apiKey: options.apiKey.trim(),
    baseURL: options.baseURL ?? DEFAULT_BASE_URL,
    defaultModel: JEV_MODEL,
    logLevel: "off",
    fetch: options.fetch,
    timeout: options.timeoutMs ?? 20_000,
    retry: options.maxRetries == null ? undefined : { maxRetries: options.maxRetries },
  });
}

async function runOne(
  client: TypeSafeClient,
  request: SystemOneRequest,
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
  maxRetries: number | undefined,
): Promise<SystemOneResponse> {
  const pending = client.systemOne(request as unknown as SdkRequest, {
    signal,
    timeout: timeoutMs,
    retry: maxRetries == null ? undefined : { maxRetries },
  });
  const wrapped = await pending.withResponse();
  const response = parseSystemOneResponse(wrapped.data);
  modelTimes.set(response, modelTimeFromHeaders(wrapped.response.headers));
  return response;
}

export async function listModels(options: {
  apiKey: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  baseURL?: string;
}): Promise<ModelCard[]> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new JevCallError(401, "Add a Jev API key before running this demo.");
  const client = new TypeSafeClient({
    apiKey,
    baseURL: options.baseURL ?? DEFAULT_BASE_URL,
    logLevel: "off",
    fetch: options.fetch,
    timeout: 15_000,
    retry: { maxRetries: 1 },
  });
  try {
    const models = await client.models.list({ signal: options.signal });
    return models.map((model) => ({
      name: model.name,
      description: model.description,
      release_date: model.release_date,
    }));
  } catch (error) {
    throw toJevCallError(error, apiKey);
  }
}

function toJevCallError(error: unknown, apiKey: string): JevCallError {
  if (error instanceof JevCallError) return error;
  if (error instanceof APIError) {
    return new JevCallError(
      error.status,
      redactSecret(messageForStatus(error.status, error.body), apiKey),
      error.requestId,
    );
  }
  if (error instanceof APITimeoutError) {
    return new JevCallError(408, "The Jev call timed out before a decision came back.");
  }
  if (error instanceof APIUserAbortError) {
    return new JevCallError(499, "The call was cancelled.");
  }
  if (error instanceof APIConnectionError) {
    return new JevCallError(503, "Could not reach the TypeSafe API.");
  }
  if (error instanceof TypeSafeError) {
    return new JevCallError(400, redactSecret(error.message, apiKey));
  }
  if (error instanceof Error) {
    return new JevCallError(500, redactSecret(error.message, apiKey));
  }
  return new JevCallError(500, "The Jev call failed.");
}
