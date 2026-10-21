import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jev/client", () => ({
  evaluateSystemOne: vi.fn(),
  evaluateSystemOneMany: vi.fn(),
  listModels: vi.fn(),
  modelMsFor: () => null,
}));

import { evaluateSystemOne } from "@/lib/jev/client";
import { POST } from "./route";

const evaluate = vi.mocked(evaluateSystemOne);

const body = {
  state: "hello",
  questions: { billing: { type: "noul", instructions: "Is this about billing?" } },
};

function call(headers?: Headers) {
  const requestHeaders = headers ?? new Headers();
  requestHeaders.set("authorization", "Bearer test-key");
  requestHeaders.set("content-type", "application/json");
  return POST(
    new Request("http://localhost/api/jev", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/jev", () => {
  beforeEach(() => {
    evaluate.mockReset();
    evaluate.mockResolvedValue({
      model: "jev-1.13.0",
      answers: { billing: { type: "noul", noul: 0.5 } },
      usage: { input_tokens: 10, output_tokens: 0 },
    });
  });

  it("keeps the 20s timeout and 2 retries when the atlas headers are absent", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(Number(response.headers.get("x-atlas-upstream-ms"))).toBeGreaterThanOrEqual(0);
    expect(response.headers.get("x-atlas-model-ms")).toBeNull();
    expect(evaluate).toHaveBeenCalledOnce();
    const options = evaluate.mock.calls[0][0];
    expect(options.timeoutMs).toBe(20_000);
    expect(options.maxRetries).toBe(2);
  });

  it("forwards an explicit timeout and an explicit retry count of zero", async () => {
    const headers = new Headers();
    headers.set("x-atlas-timeout-ms", "8000");
    headers.set("x-atlas-max-retries", "0");
    await call(headers);
    const options = evaluate.mock.calls[0][0];
    expect(options.timeoutMs).toBe(8_000);
    expect(options.maxRetries).toBe(0);
  });

  it("treats empty and non-numeric atlas headers as unset", async () => {
    const empty = new Headers();
    empty.set("x-atlas-timeout-ms", "");
    empty.set("x-atlas-max-retries", "   ");
    await call(empty);
    const blank = evaluate.mock.calls[0][0];
    expect(blank.timeoutMs).toBe(20_000);
    expect(blank.maxRetries).toBe(2);

    const junk = new Headers();
    junk.set("x-atlas-timeout-ms", "soon");
    junk.set("x-atlas-max-retries", "nope");
    await call(junk);
    const ignored = evaluate.mock.calls[1][0];
    expect(ignored.timeoutMs).toBe(20_000);
    expect(ignored.maxRetries).toBe(2);
  });
});
