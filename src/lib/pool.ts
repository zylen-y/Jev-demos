export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: {
    signal?: AbortSignal;
    onSettle?: (done: number, total: number) => void;
  },
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      if (options?.signal?.aborted) {
        throw new DOMException("The batch was cancelled.", "AbortError");
      }
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
      done += 1;
      options?.onSettle?.(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}

/** Caps how many jobs run at once across overlapping callers. */
export function createLimiter(concurrency: number) {
  const limit = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function limitRun<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
    active += 1;
    try {
      return await job();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
