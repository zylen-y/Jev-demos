import { describe, expect, it, vi } from "vitest";
import { proxySystemOneBatch } from "./proxy";

const request = {
  model: "jev-latest",
  state: { title: "Election night" },
  questions: { action: { type: "choice", instructions: "What now?", criteria: { keep: "Leave it.", revert: "Undo it." } } },
};

describe("POST batch proxy", () => {
  it("fans a backlog out through one capped call and keeps each result", async () => {
    const evaluateMany = vi.fn().mockResolvedValue([
      { status: 200, body: { model: "jev-1.14.0", answers: {}, usage: { input_tokens: 10, output_tokens: 0 } }, upstreamMs: 55, modelMs: null },
      { status: 429, body: { error: "Rate limit reached. Wait a moment, then run it again." }, upstreamMs: 12, modelMs: null },
    ]);
    const result = await proxySystemOneBatch({
      authorization: "Bearer test-key",
      bodyText: JSON.stringify({ requests: [request, request] }),
      maxRetries: 2,
      evaluateMany,
    });
    expect(result.status).toBe(200);
    expect(evaluateMany).toHaveBeenCalledOnce();
    expect(evaluateMany.mock.calls[0][0].requests).toHaveLength(2);
    expect(evaluateMany.mock.calls[0][0].maxRetries).toBe(2);
    const body = result.body as { results: { status: number }[] };
    expect(body.results.map((item) => item.status)).toEqual([200, 429]);
  });

  it("rejects a batch over the cap before calling Jev", async () => {
    const evaluateMany = vi.fn();
    const requests = Array.from({ length: 65 }, () => request);
    const result = await proxySystemOneBatch({
      authorization: "Bearer test-key",
      bodyText: JSON.stringify({ requests }),
      evaluateMany,
    });
    expect(result.status).toBe(400);
    expect(evaluateMany).not.toHaveBeenCalled();
  });
});
