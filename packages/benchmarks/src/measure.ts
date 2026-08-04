/**
 * The measurement primitives, kept apart from the suites so they can be tested
 * like anything else. A benchmark whose statistics are wrong is worse than no
 * benchmark: it produces a number people quote.
 */

/** One timed run, in milliseconds. */
export type Sample = number;

/**
 * The p-th percentile, nearest-rank. No interpolation: with the sample counts
 * here (hundreds, not millions) an interpolated p95 invents a value that was
 * never observed, and the whole point is to report something that happened.
 */
export function percentile(samples: readonly Sample[], p: number): number {
  if (samples.length === 0) throw new Error('percentile() needs at least one sample');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index]!;
}

export function mean(samples: readonly Sample[]): number {
  if (samples.length === 0) throw new Error('mean() needs at least one sample');
  return samples.reduce((total, sample) => total + sample, 0) / samples.length;
}

/**
 * Run `fn` `times` times, discarding the first `warmup` results.
 *
 * The warm-up is not ceremony: V8 tiers up a hot function over its first
 * hundred-odd calls, and a first-run number would be measuring the interpreter.
 */
export async function repeat(
  times: number,
  fn: (iteration: number) => Promise<number>,
  warmup = Math.min(20, Math.floor(times / 10)),
): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let iteration = 0; iteration < times + warmup; iteration += 1) {
    const sample = await fn(iteration);
    if (iteration >= warmup) samples.push(sample);
  }
  return samples;
}

/** Time one awaited operation. */
export async function time(fn: () => Promise<void>): Promise<number> {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

/** Let the event loop drain — delivery is asynchronous, on every transport. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
