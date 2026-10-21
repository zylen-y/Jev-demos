export function rankDescending<T>(items: readonly T[], score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function selectContext<T>(
  items: readonly T[],
  score: (item: T) => number,
  threshold: number,
  limit: number,
): T[] {
  return rankDescending(items, score)
    .filter((item) => score(item) >= threshold)
    .slice(0, limit);
}

export type PairWin = {
  winner: string;
  loser: string;
  probability: number;
};

/** Bubble winners upward when a pairwise judgment disagrees with the current order. */
export function pairwiseReorder<T extends { id: string }>(items: readonly T[], wins: readonly PairWin[]): T[] {
  const order = [...items];
  for (const win of wins) {
    if (win.probability < 0.5) continue;
    let winnerAt = order.findIndex((item) => item.id === win.winner);
    const loserAt = order.findIndex((item) => item.id === win.loser);
    if (winnerAt < 0 || loserAt < 0 || winnerAt < loserAt) continue;
    while (winnerAt > loserAt) {
      const previous = order[winnerAt - 1];
      order[winnerAt - 1] = order[winnerAt];
      order[winnerAt] = previous;
      winnerAt -= 1;
    }
  }
  return order;
}
