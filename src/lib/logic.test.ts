import { describe, expect, it } from "vitest";
import { dictionaryHits, patternHits, SIZE_PATTERN } from "./candidates";
import { DECISION_SHAPES, DEMOS } from "./catalog";
import { CORPUS_SIZE, corpusSlice, traceAt } from "./corpus";
import {
  decideAutomation,
  decideClaim,
  decideGuardrails,
  decideModeration,
  decideRecruiting,
  decideRouter,
  automationThresholds,
  claimThresholds,
  guardrailThresholds,
  moderationThresholds,
  recruitingThresholds,
  routerThresholds,
} from "./decisions";
import { applyMultiplier, seasonalForecast, semanticMultiplier } from "./forecast";
import { forceLayout, mostProbablePath } from "./graph";
import { maskApiKey, readStoredKey, writeStoredKey, API_KEY_STORAGE_KEY } from "./key";
import { buildLintRequest, interpretLint } from "./lint/rules";
import { binaryMetrics, forwardSelect, lift, splitIndexes, trainLogistic } from "./ml";
import { createLimiter, mapPool } from "./pool";
import { pairwiseReorder, selectContext } from "./rank";
import { caseDemos, SPECIAL_SLUGS } from "./demos/registry";
import { thresholdDefaults } from "./demos/types";
import type { Answer, Question } from "./jev/types";

describe("catalog", () => {
  it("covers every category, use case, bullet, and decision shape", () => {
    expect(DEMOS.filter((demo) => demo.kind === "category")).toHaveLength(5);
    expect(DEMOS.filter((demo) => demo.kind === "use-case")).toHaveLength(19);
    const shapes = new Set(DEMOS.flatMap((demo) => demo.shapes));
    for (const shape of DECISION_SHAPES) expect(shapes.has(shape.id)).toBe(true);
    for (const demo of DEMOS) expect(demo.bullets.length).toBeGreaterThan(0);
    const slugs = new Set(DEMOS.map((demo) => demo.slug));
    expect(slugs.size).toBe(DEMOS.length);
    const implemented = new Set([...caseDemos.map((demo) => demo.slug), ...SPECIAL_SLUGS]);
    expect(implemented).toEqual(slugs);
  });
});

describe("case demos", () => {
  it("builds a valid request and reads a synthetic answer", () => {
    for (const demo of caseDemos) {
      const sample = demo.samples[0];
      const systemRequest = demo.request(sample.fields);
      expect(systemRequest.model).toBe("jev-latest");
      expect(Object.keys(systemRequest.questions).length).toBeGreaterThan(0);
      for (const question of Object.values(systemRequest.questions)) {
        if (question.type === "score") expect(question.criteria.length).toBeGreaterThanOrEqual(2);
        if (question.type === "choice") expect(Object.keys(question.criteria).length).toBeGreaterThan(0);
        if (question.type === "noul") expect(question.instructions?.length).toBeGreaterThan(8);
      }
      const view = demo.decide(fakeAnswers(systemRequest.questions), sample.fields, thresholdDefaults(demo));
      expect(view.headline.length).toBeGreaterThan(0);
      expect(view.groups.length).toBeGreaterThan(0);
    }
  });
});

describe("decisions", () => {
  it("refuses a jailbreak before it refunds", () => {
    const decision = decideAutomation(
      { department: "billing", departmentConfidence: 0.9, urgency: 0.9, refundRequested: 0.9, jailbreak: 0.8, sensitiveData: 0.1 },
      automationThresholds,
    );
    expect(decision.destination).toBe("refuse");
  });

  it("escalates a hard risky prompt", () => {
    const decision = decideRouter({ intent: "create", intentConfidence: 0.4, domain: "legal", difficulty: 0.9, risk: 0.8 }, routerThresholds);
    expect(decision.destination).toBe("reasoning-model");
  });

  it("blocks when harm, severity, and confidence all clear", () => {
    const decision = decideModeration(
      {
        toxicity: 0.9,
        harassment: 0.1,
        spam: 0.1,
        fraud: 0.1,
        unsafeAdvice: 0.1,
        personalData: 0.1,
        optOut: 0.1,
        policyViolation: 0.2,
        severity: 0.9,
        severityConfidence: 0.8,
      },
      moderationThresholds,
    );
    expect(decision.action).toBe("block");
  });

  it("sends an opt-out to confirmation instead of a block", () => {
    const decision = decideModeration(
      {
        toxicity: 0.1,
        harassment: 0.1,
        spam: 0.1,
        fraud: 0.1,
        unsafeAdvice: 0.1,
        personalData: 0.1,
        optOut: 0.9,
        policyViolation: 0.1,
        severity: 0.2,
        severityConfidence: 0.8,
      },
      moderationThresholds,
    );
    expect(decision.action).toBe("opt-out");
  });

  it("escalates a high fraud claim and straight-throughs a simple one", () => {
    expect(
      decideClaim({ peril: "theft", perilConfidence: 0.8, complexity: 0.2, missing: 0.2, fraud: 0.9 }, claimThresholds).destination,
    ).toBe("specialist-adjuster");
    expect(
      decideClaim({ peril: "water", perilConfidence: 0.9, complexity: 0.2, missing: 0.1, fraud: 0.1 }, claimThresholds).destination,
    ).toBe("straight-through");
  });

  it("holds a low-confidence recruiting match", () => {
    const decision = decideRecruiting(
      { experience: [0.9, 0.9, 0.9], competencies: [0.9, 0.9, 0.9], match: "strong", matchConfidence: 0.2 },
      recruitingThresholds,
    );
    expect(decision.destination).toBe("human-review");
  });

  it("blocks the worst guardrail", () => {
    const decision = decideGuardrails(
      {
        jailbreak: 0.1,
        injection: 0.1,
        inputPolicy: 0.1,
        inputSensitive: 0.1,
        outputPolicy: 0.95,
        outputSensitive: 0.1,
        qualityFailure: 0.2,
        toolError: 0.1,
      },
      guardrailThresholds,
    );
    expect(decision.destination).toBe("block");
  });
});

describe("ml, forecast, rank, graph, pool, corpus, lint, key", () => {
  it("trains a separable logistic model and keeps the useful feature", () => {
    const rows = Array.from({ length: 40 }, (_, index) => {
      const y = (index < 20 ? 0 : 1) as 0 | 1;
      const signal = y === 1 ? 2 : -2;
      const noise = ((index * 17) % 10) / 10 - 0.5;
      return { x: [signal, noise], y };
    });
    const model = trainLogistic(rows, { epochs: 500, learningRate: 0.4, l2: 0 });
    const probabilities = rows.map((row) => {
      const p = 1 / (1 + Math.exp(-(model.bias + model.weights[0] * ((row.x[0] - model.mean[0]) / model.std[0]))));
      return p;
    });
    const metrics = binaryMetrics(
      rows.map((row) => row.y),
      rows.map((row) => {
        const scaled = [(row.x[0] - model.mean[0]) / model.std[0], (row.x[1] - model.mean[1]) / model.std[1]];
        const z = model.bias + model.weights[0] * scaled[0] + model.weights[1] * scaled[1];
        return 1 / (1 + Math.exp(-z));
      }),
    );
    expect(metrics.accuracy).toBe(1);
    expect(metrics.auc).toBe(1);
    const { train, test } = splitIndexes(rows.length, 0.3, 3);
    const selected = forwardSelect(rows, train, test);
    expect(selected.selected[0]).toBe(0);
    expect(lift(metrics.accuracy, 0.5).points).toBeGreaterThan(0.4);
    expect(probabilities[0]).toBeGreaterThan(0);
  });

  it("raises a forecast when intent is high and lowers it when supply is tight", () => {
    const history = [10, 12, 11, 13, 12, 14, 13, 16];
    const forecast = seasonalForecast(history, 4);
    expect(forecast).toHaveLength(4);
    expect(forecast.every((value) => value > 0)).toBe(true);
    const up = semanticMultiplier({ intent: 0.9, urgency: 0.8, interest: 0.8, supply: 0.1, competition: 0.1 });
    const down = semanticMultiplier({ intent: 0.2, urgency: 0.2, interest: 0.2, supply: 0.9, competition: 0.8 });
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(1);
    expect(applyMultiplier(forecast, up)[0]).toBeGreaterThan(forecast[0]);
  });

  it("reranks with a pairwise win and keeps context above a threshold", () => {
    const items = [
      { id: "a", score: 0.9 },
      { id: "b", score: 0.4 },
    ];
    const reranked = pairwiseReorder(items, [{ winner: "b", loser: "a", probability: 0.8 }]);
    expect(reranked.map((item) => item.id)).toEqual(["b", "a"]);
    expect(selectContext(items, (item) => item.score, 0.5, 2).map((item) => item.id)).toEqual(["a"]);
  });

  it("walks the higher-probability path", () => {
    const path = mostProbablePath(
      [
        { source: "a", target: "c", p: 0.2 },
        { source: "a", target: "b", p: 0.9 },
        { source: "b", target: "c", p: 0.9 },
      ],
      "a",
      "c",
    );
    expect(path?.path).toEqual(["a", "b", "c"]);
    const layout = forceLayout([{ id: "a" }, { id: "b" }], [{ source: "a", target: "b" }]);
    expect(Number.isFinite(layout.a.x)).toBe(true);
    expect(Number.isFinite(layout.b.y)).toBe(true);
  });

  it("caps pool concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await mapPool([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("shares one limiter across overlapping batches", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      [1, 2, 3, 4].map((item) =>
        limit(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return item;
        }),
      ),
    );
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("generates two thousand labeled traces", () => {
    expect(corpusSlice(CORPUS_SIZE)).toHaveLength(2000);
    expect(traceAt(0).text.length).toBeGreaterThan(40);
    expect(traceAt(0).kind).not.toBe(traceAt(1).kind);
  });

  it("asks for a line and a presence check", () => {
    const source = "export const key = \"sk_live_demo\";\n";
    const systemRequest = buildLintRequest("secret.ts", source);
    expect(systemRequest.questions.embedded_secret_present.type).toBe("noul");
    expect(systemRequest.questions.embedded_secret_line.type).toBe("choice");
    const findings = interpretLint(
      "secret.ts",
      source,
      {
        embedded_secret_present: { type: "noul", noul: 0.91 },
        embedded_secret_line: { type: "choice", choice: "1", confidence: 0.8, probabilities: { "1": 0.8, none: 0.2 } },
        swallowed_error_present: { type: "noul", noul: 0.1 },
        swallowed_error_line: { type: "choice", choice: "none", confidence: 0.5, probabilities: { none: 0.9, "1": 0.1 } },
        unowned_todo_present: { type: "noul", noul: 0.1 },
        unowned_todo_line: { type: "choice", choice: "none", confidence: 0.5, probabilities: { none: 1 } },
        hidden_side_effect_present: { type: "noul", noul: 0.1 },
        hidden_side_effect_line: { type: "choice", choice: "none", confidence: 0.5, probabilities: { none: 1 } },
      },
      0.6,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  it("masks a key and round-trips storage without cookies", () => {
    expect(API_KEY_STORAGE_KEY.toLowerCase()).not.toContain("cookie");
    expect(maskApiKey("ts_live_abcdefghijk")).toBe("ts_l…hijk");
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    };
    writeStoredKey(storage, "  abcdefghijklmnop  ");
    expect(readStoredKey(storage)).toBe("abcdefghijklmnop");
    writeStoredKey(storage, "   ");
    expect(readStoredKey(storage)).toBe("");
  });

  it("finds pre-parsed attribute spans", () => {
    const text = "Northline duvet, sage, queen";
    expect(dictionaryHits(text, ["sage", "navy"])).toEqual(["sage"]);
    expect(patternHits(text, SIZE_PATTERN)).toContain("queen");
  });
});

function fakeAnswers(questions: Record<string, Question>): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(questions)) {
    if (question.type === "noul") {
      answers[id] = { type: "noul", noul: 0.22 };
    } else if (question.type === "choice") {
      const keys = Object.keys(question.criteria);
      const probabilities = Object.fromEntries(keys.map((key, index) => [key, index === 0 ? 0.7 : 0.3 / Math.max(1, keys.length - 1)]));
      answers[id] = { type: "choice", choice: keys[0], confidence: 0.62, probabilities };
    } else {
      const legend = Object.fromEntries(question.criteria.map((level, index) => [String(index), level]));
      const probabilities = Object.fromEntries(question.criteria.map((_, index) => [String(index), index === 0 ? 0.6 : 0.4 / Math.max(1, question.criteria.length - 1)]));
      answers[id] = { type: "score", score: 0.4, confidence: 0.5, legend, probabilities };
    }
  }
  return answers;
}
