import { clamp } from "./format";

export type LogisticModel = {
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
};

export type BinaryMetrics = {
  accuracy: number;
  logLoss: number;
  auc: number;
};

export function sigmoid(value: number): number {
  if (value > 30) return 1;
  if (value < -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

export function trainLogistic(
  rows: { x: number[]; y: 0 | 1 }[],
  options?: { learningRate?: number; epochs?: number; l2?: number },
): LogisticModel {
  if (rows.length === 0) throw new Error("Train on at least one row.");
  const width = rows[0].x.length;
  const mean = Array.from({ length: width }, (_, j) => average(rows.map((row) => row.x[j] ?? 0)));
  const std = Array.from({ length: width }, (_, j) => {
    const variance = average(rows.map((row) => (row.x[j] - mean[j]) ** 2));
    return Math.sqrt(variance) || 1;
  });
  const scaled = rows.map((row) => ({
    y: row.y,
    x: row.x.map((value, j) => (value - mean[j]) / std[j]),
  }));
  const learningRate = options?.learningRate ?? 0.35;
  const epochs = options?.epochs ?? 600;
  const l2 = options?.l2 ?? 0.01;
  const weights = Array.from({ length: width }, () => 0);
  let bias = 0;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = Array.from({ length: width }, () => 0);
    let gradB = 0;
    for (const row of scaled) {
      const prediction = sigmoid(bias + dot(weights, row.x));
      const error = prediction - row.y;
      for (let j = 0; j < width; j += 1) gradW[j] += error * row.x[j];
      gradB += error;
    }
    const n = scaled.length;
    for (let j = 0; j < width; j += 1) {
      weights[j] -= learningRate * (gradW[j] / n + l2 * weights[j]);
    }
    bias -= learningRate * (gradB / n);
  }
  return { weights, bias, mean, std };
}

export function predictProbability(model: LogisticModel, x: number[]): number {
  const scaled = x.map((value, j) => (value - (model.mean[j] ?? 0)) / (model.std[j] || 1));
  return sigmoid(model.bias + dot(model.weights, scaled));
}

export function binaryMetrics(y: number[], probability: number[], threshold = 0.5): BinaryMetrics {
  if (y.length !== probability.length || y.length === 0) {
    return { accuracy: 0, logLoss: 0, auc: 0.5 };
  }
  let correct = 0;
  let loss = 0;
  for (let i = 0; i < y.length; i += 1) {
    const p = clamp(probability[i], 1e-6, 1 - 1e-6);
    if ((p >= threshold ? 1 : 0) === y[i]) correct += 1;
    loss += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
  }
  return {
    accuracy: correct / y.length,
    logLoss: loss / y.length,
    auc: areaUnderRoc(y, probability),
  };
}

export function areaUnderRoc(y: number[], probability: number[]): number {
  const positives: number[] = [];
  const negatives: number[] = [];
  for (let i = 0; i < y.length; i += 1) {
    if (y[i] === 1) positives.push(probability[i]);
    else negatives.push(probability[i]);
  }
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  let wins = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive > negative) wins += 1;
      else if (positive === negative) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}

export function majorityProbability(y: number[]): number {
  if (y.length === 0) return 0.5;
  return y.reduce((sum, value) => sum + value, 0) / y.length;
}

export function lift(modelAccuracy: number, baselineAccuracy: number): { points: number; ratio: number } {
  const points = modelAccuracy - baselineAccuracy;
  const ratio = baselineAccuracy <= 0 ? (modelAccuracy > 0 ? Infinity : 1) : modelAccuracy / baselineAccuracy;
  return { points, ratio };
}

export type SelectionStep = {
  features: number[];
  testLogLoss: number;
  testAccuracy: number;
};

/** Greedy forward selection. A feature is kept only when held-out log loss drops. */
export function forwardSelect(
  rows: { x: number[]; y: 0 | 1 }[],
  trainIdx: number[],
  testIdx: number[],
  options?: { minImprovement?: number },
): { selected: number[]; trail: SelectionStep[] } {
  const width = rows[0]?.x.length ?? 0;
  const minImprovement = options?.minImprovement ?? 0.005;
  const remaining = new Set(Array.from({ length: width }, (_, index) => index));
  const selected: number[] = [];
  const trail: SelectionStep[] = [];
  let bestLoss = Number.POSITIVE_INFINITY;

  const base = evaluateFeatures(rows, trainIdx, testIdx, []);
  trail.push({ features: [], ...base });
  bestLoss = base.testLogLoss;

  while (remaining.size > 0) {
    let winner: number | null = null;
    let winnerMetrics: { testLogLoss: number; testAccuracy: number } | null = null;
    for (const feature of remaining) {
      const metrics = evaluateFeatures(rows, trainIdx, testIdx, [...selected, feature]);
      if (!winnerMetrics || metrics.testLogLoss < winnerMetrics.testLogLoss) {
        winner = feature;
        winnerMetrics = metrics;
      }
    }
    if (winner == null || winnerMetrics == null) break;
    if (bestLoss - winnerMetrics.testLogLoss < minImprovement) break;
    selected.push(winner);
    remaining.delete(winner);
    bestLoss = winnerMetrics.testLogLoss;
    trail.push({ features: [...selected], ...winnerMetrics });
  }
  return { selected, trail };
}

function evaluateFeatures(
  rows: { x: number[]; y: 0 | 1 }[],
  trainIdx: number[],
  testIdx: number[],
  features: number[],
): { testLogLoss: number; testAccuracy: number } {
  const project = (index: number) => ({
    y: rows[index].y,
    x: features.map((feature) => rows[index].x[feature] ?? 0),
  });
  const train = trainIdx.map(project);
  if (features.length === 0) {
    const base = majorityProbability(train.map((row) => row.y));
    const probability = testIdx.map(() => base);
    const metrics = binaryMetrics(
      testIdx.map((index) => rows[index].y),
      probability,
    );
    return { testLogLoss: metrics.logLoss, testAccuracy: metrics.accuracy };
  }
  const model = trainLogistic(train, { epochs: 400, learningRate: 0.4 });
  const probability = testIdx.map((index) => predictProbability(model, project(index).x));
  const metrics = binaryMetrics(
    testIdx.map((index) => rows[index].y),
    probability,
  );
  return { testLogLoss: metrics.logLoss, testAccuracy: metrics.accuracy };
}

export function splitIndexes(count: number, holdoutFraction = 0.35, seed = 7): { train: number[]; test: number[] } {
  const order = seededOrder(count, seed);
  const testCount = Math.max(1, Math.round(count * holdoutFraction));
  return {
    test: order.slice(0, testCount).sort((a, b) => a - b),
    train: order.slice(testCount).sort((a, b) => a - b),
  };
}

export function seededOrder(count: number, seed: number): number[] {
  const items = Array.from({ length: count }, (_, index) => index);
  let state = seed || 1;
  for (let i = items.length - 1; i > 0; i -= 1) {
    state = (state * 16807) % 2147483647;
    const j = state % (i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * (b[i] ?? 0);
  return sum;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
