import { evaluateSystemOne, evaluateSystemOneMany, listModels, modelMsFor, type BatchItem } from "./client";
import { JevCallError, redactSecret } from "./errors";
import { validateSystemOneBody } from "./validate";

const MAX_BODY_CHARS = 1_000_000;

export function readBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

export async function proxySystemOne(options: {
  authorization: string | null;
  bodyText: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  evaluate?: typeof evaluateSystemOne;
}): Promise<{ status: number; body: unknown; upstreamMs?: number; modelMs?: number | null }> {
  const apiKey = readBearer(options.authorization);
  if (!apiKey) {
    return {
      status: 401,
      body: { error: "Send the Jev API key as Authorization: Bearer <key>. The key stays in your browser." },
    };
  }
  if (options.bodyText.length > MAX_BODY_CHARS) {
    return { status: 413, body: { error: "That request is too large for the demo proxy." } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.bodyText);
  } catch {
    return { status: 400, body: { error: "Request body must be JSON." } };
  }
  const validation = validateSystemOneBody(parsed);
  if (!validation.ok) {
    return { status: 400, body: { error: validation.message } };
  }
  const timeoutMs = clampNumber(options.timeoutMs, 1_000, 30_000, 20_000);
  const maxRetries = clampNumber(options.maxRetries, 0, 2, 2);
  try {
    const evaluate = options.evaluate ?? evaluateSystemOne;
    const started = performance.now();
    const response = await evaluate({
      apiKey,
      request: validation.request,
      signal: options.signal,
      timeoutMs,
      maxRetries,
    });
    const upstreamMs = performance.now() - started;
    const modelMs = typeof modelMsFor === "function" ? modelMsFor(response) : null;
    return { status: 200, body: response, upstreamMs, modelMs };
  } catch (error) {
    const status = error instanceof JevCallError ? error.status : 500;
    const message = error instanceof Error ? error.message : "The Jev call failed.";
    return { status: httpStatus(status), body: { error: redactSecret(message, apiKey) } };
  }
}

export async function proxyModels(options: {
  authorization: string | null;
  signal?: AbortSignal;
  list?: typeof listModels;
}): Promise<{ status: number; body: unknown }> {
  const apiKey = readBearer(options.authorization);
  if (!apiKey) {
    return { status: 401, body: { error: "Send the Jev API key as Authorization: Bearer <key>." } };
  }
  try {
    const list = options.list ?? listModels;
    const models = await list({ apiKey, signal: options.signal });
    return { status: 200, body: { models } };
  } catch (error) {
    const status = error instanceof JevCallError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not list models.";
    return { status: httpStatus(status), body: { error: redactSecret(message, apiKey) } };
  }
}

const MAX_BATCH = 64;

export async function proxySystemOneBatch(options: {
  authorization: string | null;
  bodyText: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  evaluateMany?: typeof evaluateSystemOneMany;
}): Promise<{ status: number; body: unknown }> {
  const apiKey = readBearer(options.authorization);
  if (!apiKey) {
    return { status: 401, body: { error: "Send the Jev API key as Authorization: Bearer <key>." } };
  }
  if (options.bodyText.length > MAX_BODY_CHARS) {
    return { status: 413, body: { error: "That request is too large for the demo proxy." } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.bodyText);
  } catch {
    return { status: 400, body: { error: "Request body must be JSON." } };
  }
  const requests = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { requests?: unknown }).requests : null;
  if (!Array.isArray(requests) || requests.length === 0) {
    return { status: 400, body: { error: "Batch requests must be a non-empty list." } };
  }
  if (requests.length > MAX_BATCH) {
    return { status: 400, body: { error: `A batch can carry at most ${MAX_BATCH} requests.` } };
  }
  const valid = [];
  for (const item of requests) {
    const validation = validateSystemOneBody(item);
    if (!validation.ok) return { status: 400, body: { error: validation.message } };
    valid.push(validation.request);
  }
  const timeoutMs = clampNumber(options.timeoutMs, 1_000, 30_000, 8_000);
  const maxRetries = clampNumber(options.maxRetries, 0, 2, 2);
  try {
    const evaluateMany = options.evaluateMany ?? evaluateSystemOneMany;
    const results: BatchItem[] = await evaluateMany({
      apiKey,
      requests: valid,
      signal: options.signal,
      timeoutMs,
      maxRetries,
    });
    return { status: 200, body: { results } };
  } catch (error) {
    const status = error instanceof JevCallError ? error.status : 500;
    const message = error instanceof Error ? error.message : "The Jev call failed.";
    return { status: httpStatus(status), body: { error: redactSecret(message, apiKey) } };
  }
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function httpStatus(status: number): number {
  if (status === 499) return 499;
  if (status >= 400 && status <= 599) return status;
  return 500;
}
