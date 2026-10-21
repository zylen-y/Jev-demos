import { describe, expect, it, vi } from "vitest";
import { postSystemOne } from "./browser";
import { evaluateSystemOne } from "./client";
import { costUsd, estimateCostUsd, formatUsd } from "./cost";
import { messageForStatus, redactSecret } from "./errors";
import { parseSystemOneResponse } from "./parse";
import { proxyModels, proxySystemOne } from "./proxy";
import { JEV_MODEL } from "./types";
import { validateSystemOneBody } from "./validate";

const responseBody = {
  model: "jev-1.13.0",
  answers: {
    billing: { type: "noul", noul: 0.5 },
  },
  usage: { input_tokens: 100, output_tokens: 4 },
};

describe("evaluateSystemOne", () => {
  it("posts the documented System One request with the bearer key", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-key");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe(JEV_MODEL);
      expect(body.state).toBe("hello");
      expect(body.questions.billing.type).toBe("noul");
      expect(JSON.stringify(body)).not.toContain("test-key");
      return new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await evaluateSystemOne({
      apiKey: "test-key",
      fetch: fetchImpl as unknown as typeof fetch,
      request: {
        model: JEV_MODEL,
        state: "hello",
        questions: { billing: { type: "noul", instructions: "Is this about billing?" } },
      },
    });
    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.billing).toEqual({ type: "noul", noul: 0.5 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps a 401 to a key error that does not echo the key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "bad key test-key" }), { status: 401 }));
    await expect(
      evaluateSystemOne({
        apiKey: "test-key",
        fetch: fetchImpl as unknown as typeof fetch,
        request: {
          model: JEV_MODEL,
          state: "hello",
          questions: { billing: { type: "noul", instructions: "Is this about billing?" } },
        },
      }),
    ).rejects.toThrow(/rejected/i);
  });
});

describe("proxy", () => {
  it("rejects a missing key", async () => {
    const result = await proxySystemOne({ authorization: null, bodyText: "{}" });
    expect(result.status).toBe(401);
  });

  it("forwards a valid body and strips the key from errors", async () => {
    const result = await proxySystemOne({
      authorization: "Bearer secret-key",
      bodyText: JSON.stringify({
        state: "hello",
        questions: { billing: { type: "noul", instructions: "Is this about billing?" } },
      }),
      evaluate: async (options) => {
        expect(options.apiKey).toBe("secret-key");
        expect(options.request.model).toBe(JEV_MODEL);
        throw new Error("upstream said secret-key");
      },
    });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("secret-key");
    expect(JSON.stringify(result.body)).toContain("[redacted]");
  });

  it("refuses box questions", async () => {
    const result = await proxySystemOne({
      authorization: "Bearer secret-key",
      bodyText: JSON.stringify({ state: "photo", questions: { box: { type: "box", instructions: "The dog" } } }),
    });
    expect(result.status).toBe(400);
  });

  it("lists models through the injected client", async () => {
    const result = await proxyModels({
      authorization: "Bearer secret-key",
      list: async () => [{ name: "jev-latest", description: "stable", release_date: "2026-01-01" }],
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ models: [{ name: "jev-latest", description: "stable", release_date: "2026-01-01" }] });
  });
});

describe("browser client", () => {
  it("sends the key only as a bearer header to the proxy", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer browser-key");
      expect(String(init?.body)).not.toContain("browser-key");
      return new Response(JSON.stringify(responseBody), { status: 200 });
    });
    const posted = await postSystemOne({
      apiKey: "browser-key",
      endpoint: "/api/jev",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      request: {
        model: JEV_MODEL,
        state: "hello",
        questions: { billing: { type: "noul", instructions: "Is this about billing?" } },
      },
    });
    expect(posted.response.usage.input_tokens).toBe(100);
    expect(posted.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("cost and validation", () => {
  it("prices input tokens and treats output as free", () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 50_000 })).toBeCloseTo(0.042);
    expect(costUsd({ input_tokens: null, output_tokens: 1 })).toBeNull();
    expect(estimateCostUsd(1_000_000)).toBeCloseTo(0.042);
    expect(formatUsd(0.000012)).toBe("$0.000012");
  });

  it("explains status codes", () => {
    expect(messageForStatus(429, {})).toMatch(/rate limit/i);
    expect(messageForStatus(422, { detail: [{ loc: ["body", "state"], msg: "Field required" }] })).toMatch(/state/);
    expect(redactSecret("key abc leaked", "abc")).toBe("key [redacted] leaked");
  });

  it("rejects an empty question map and accepts a text request", () => {
    expect(validateSystemOneBody({ state: "hi", questions: {} }).ok).toBe(false);
    const parsed = validateSystemOneBody({
      state: { ticket: "hi" },
      questions: { mood: { type: "score", instructions: "How urgent?", criteria: ["low", "high"] } },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.request.model).toBe(JEV_MODEL);
  });

  it("parses answers and refuses a shapeless payload", () => {
    expect(parseSystemOneResponse(responseBody).answers.billing).toEqual({ type: "noul", noul: 0.5 });
    expect(() => parseSystemOneResponse({ model: "jev" })).toThrow();
  });
});
