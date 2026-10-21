import { evaluateSystemOne, listModels } from "./client";
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
}): Promise<{ status: number; body: unknown }> {
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
    const response = await evaluate({
      apiKey,
      request: validation.request,
      signal: options.signal,
      timeoutMs,
      maxRetries,
    });
    return { status: 200, body: response };
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

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function httpStatus(status: number): number {
  if (status === 499) return 499;
  if (status >= 400 && status <= 599) return status;
  return 500;
}
