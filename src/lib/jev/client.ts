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
import { JevCallError, messageForStatus, redactSecret } from "./errors";
import { parseSystemOneResponse } from "./parse";
import type { ModelCard, SystemOneRequest, SystemOneResponse } from "./types";
import { DEFAULT_BASE_URL, JEV_MODEL } from "./types";

export type EvaluateOptions = {
  apiKey: string;
  request: SystemOneRequest;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  baseURL?: string;
};

export async function evaluateSystemOne(options: EvaluateOptions): Promise<SystemOneResponse> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new JevCallError(401, "Add a Jev API key before running this demo.");
  }
  const client = new TypeSafeClient({
    apiKey,
    baseURL: options.baseURL ?? DEFAULT_BASE_URL,
    defaultModel: JEV_MODEL,
    logLevel: "off",
    fetch: options.fetch,
    timeout: options.timeoutMs ?? 20_000,
    retry: options.maxRetries == null ? undefined : { maxRetries: options.maxRetries },
  });
  try {
    const result = await client.systemOne(options.request as unknown as SdkRequest, {
      signal: options.signal,
      timeout: options.timeoutMs,
      retry: options.maxRetries == null ? undefined : { maxRetries: options.maxRetries },
    });
    return parseSystemOneResponse(result);
  } catch (error) {
    throw toJevCallError(error, apiKey);
  }
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
