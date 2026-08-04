import { describe, expect, it } from 'vitest';
import { mean, percentile, repeat, settle, time } from '../measure.js';

describe('percentile', () => {
  it('takes the nearest rank, never an invented value', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(samples, 50)).toBe(5);
    expect(percentile(samples, 95)).toBe(10);
    expect(percentile(samples, 100)).toBe(10);
  });

  it('does not care what order the samples arrived in', () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
  });

  it('clamps a percentile of zero to the smallest sample', () => {
    expect(percentile([4, 8, 15], 0)).toBe(4);
  });

  it('refuses to report a percentile of nothing', () => {
    expect(() => percentile([], 50)).toThrow(/at least one sample/);
  });
});

describe('mean', () => {
  it('averages', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('refuses to average nothing', () => {
    expect(() => mean([])).toThrow(/at least one sample/);
  });
});

describe('repeat', () => {
  it('discards the warm-up and keeps the rest', async () => {
    const seen: number[] = [];
    const samples = await repeat(
      5,
      async (iteration) => {
        seen.push(iteration);
        return iteration;
      },
      2,
    );

    expect(seen).toHaveLength(7);
    expect(samples).toEqual([2, 3, 4, 5, 6]);
  });

  it('defaults the warm-up to a tenth of the run, capped', async () => {
    const samples = await repeat(30, async () => 1);
    expect(samples).toHaveLength(30);
  });
});

describe('time', () => {
  it('measures the awaited operation', async () => {
    const elapsed = await time(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });
});

describe('settle', () => {
  it('resolves after the event loop turns', async () => {
    await expect(settle()).resolves.toBeUndefined();
  });
});
