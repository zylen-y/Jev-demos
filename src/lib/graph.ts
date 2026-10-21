export type GraphEdge = {
  source: string;
  target: string;
  p: number;
};

export function mostProbablePath(
  edges: readonly GraphEdge[],
  start: string,
  goal: string,
): { path: string[]; probability: number } | null {
  if (start === goal) return { path: [start], probability: 1 };
  const adjacent = new Map<string, { id: string; p: number }[]>();
  for (const edge of edges) {
    if (edge.p <= 0) continue;
    push(adjacent, edge.source, edge.target, edge.p);
    push(adjacent, edge.target, edge.source, edge.p);
  }
  const nodes = new Set<string>([start, goal, ...adjacent.keys()]);
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const node of nodes) {
    dist.set(node, Number.POSITIVE_INFINITY);
    prev.set(node, null);
  }
  dist.set(start, 0);
  const unused = new Set(nodes);
  while (unused.size > 0) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const node of unused) {
      const weight = dist.get(node) ?? Number.POSITIVE_INFINITY;
      if (weight < best) {
        best = weight;
        current = node;
      }
    }
    if (current == null || best === Number.POSITIVE_INFINITY) break;
    unused.delete(current);
    if (current === goal) break;
    for (const next of adjacent.get(current) ?? []) {
      const weight = -Math.log(Math.max(next.p, 1e-9));
      const candidate = best + weight;
      if (candidate < (dist.get(next.id) ?? Number.POSITIVE_INFINITY)) {
        dist.set(next.id, candidate);
        prev.set(next.id, current);
      }
    }
  }
  if ((dist.get(goal) ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) return null;
  const path: string[] = [];
  let cursor: string | null = goal;
  while (cursor) {
    path.push(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  path.reverse();
  let probability = 1;
  for (let i = 0; i < path.length - 1; i += 1) {
    const step = edges.find(
      (edge) =>
        (edge.source === path[i] && edge.target === path[i + 1]) ||
        (edge.source === path[i + 1] && edge.target === path[i]),
    );
    probability *= step?.p ?? 0;
  }
  return { path, probability };
}

function push(map: Map<string, { id: string; p: number }[]>, source: string, target: string, p: number) {
  const list = map.get(source) ?? [];
  list.push({ id: target, p });
  map.set(source, list);
}

export function forceLayout(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string }[],
  options?: { iterations?: number; seed?: number },
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length);
    positions[node.id] = { x: Math.cos(angle) * 180, y: Math.sin(angle) * 180 };
  });
  const iterations = options?.iterations ?? 120;
  for (let step = 0; step < iterations; step += 1) {
    const disp: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) disp[node.id] = { x: 0, y: 0 };
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = positions[a.id].x - positions[b.id].x;
        let dy = positions[a.id].y - positions[b.id].y;
        let distance = Math.hypot(dx, dy) || 0.01;
        dx /= distance;
        dy /= distance;
        const force = 2800 / (distance * distance);
        disp[a.id].x += dx * force;
        disp[a.id].y += dy * force;
        disp[b.id].x -= dx * force;
        disp[b.id].y -= dy * force;
      }
    }
    for (const edge of edges) {
      if (!positions[edge.source] || !positions[edge.target]) continue;
      let dx = positions[edge.target].x - positions[edge.source].x;
      let dy = positions[edge.target].y - positions[edge.source].y;
      const distance = Math.hypot(dx, dy) || 0.01;
      dx /= distance;
      dy /= distance;
      const force = (distance * distance) / 9000;
      disp[edge.source].x += dx * force;
      disp[edge.source].y += dy * force;
      disp[edge.target].x -= dx * force;
      disp[edge.target].y -= dy * force;
    }
    const temperature = 12 * (1 - step / iterations);
    for (const node of nodes) {
      const velocity = Math.hypot(disp[node.id].x, disp[node.id].y) || 1;
      const scale = Math.min(temperature, velocity) / velocity;
      positions[node.id].x += disp[node.id].x * scale;
      positions[node.id].y += disp[node.id].y * scale;
    }
  }
  return positions;
}

export const HIERARCHY: Record<string, Record<string, string>> = {
  biology: {
    organism: "A living strain, species, or cell line",
    assay: "A measurement performed on a biological sample",
    field_trial: "An experiment run outside the lab",
  },
  materials: {
    catalyst: "A material that changes a reaction",
    polymer: "A long-chain material",
    solvent: "A liquid used to dissolve or carry a sample",
  },
  methods: {
    statistics: "An analysis method",
    protocol: "A procedure someone can rerun",
    instrumentation: "A device or sensor",
  },
};
