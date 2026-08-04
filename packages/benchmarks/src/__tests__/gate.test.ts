import { describe, expect, it } from 'vitest';
import { BUDGETS } from '../budgets.js';
import { checkBudgets, type Budget } from '../gate.js';

const budget = (over: Partial<Budget> = {}): Budget => ({
  metric: 'store.p50-vs-raw',
  comparison: 'at-most',
  limit: 4,
  because: 'because',
  ...over,
});

describe('checkBudgets', () => {
  it('passes a reading inside an at-most budget', () => {
    const result = checkBudgets([{ metric: 'store.p50-vs-raw', value: 1.8 }], [budget()]);
    expect(result.ok).toBe(true);
    expect(result.lines[0]).toContain('✔');
    expect(result.lines[0]).toContain('1.80 ≤ 4');
  });

  it('passes a reading exactly on the limit', () => {
    expect(checkBudgets([{ metric: 'store.p50-vs-raw', value: 4 }], [budget()]).ok).toBe(true);
  });

  it('fails a reading over an at-most budget, and says why', () => {
    const result = checkBudgets(
      [{ metric: 'store.p50-vs-raw', value: 9 }],
      [budget({ because: 'work per peer that should be per post' })],
    );
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toContain('✖');
    expect(result.lines[0]).toContain('work per peer');
  });

  it('reads an at-least budget the other way round', () => {
    const floor = budget({
      metric: 'channel.throughput-vs-raw',
      comparison: 'at-least',
      limit: 0.25,
    });
    expect(checkBudgets([{ metric: floor.metric, value: 0.34 }], [floor]).ok).toBe(true);
    expect(checkBudgets([{ metric: floor.metric, value: 0.1 }], [floor]).ok).toBe(false);
  });

  it('fails a budget nothing measured', () => {
    const result = checkBudgets([], [budget()]);
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toContain('did the suite stop running?');
  });

  it('keeps failing once anything failed', () => {
    const result = checkBudgets(
      [
        { metric: 'a', value: 9 },
        { metric: 'b', value: 1 },
      ],
      [budget({ metric: 'a', limit: 4 }), budget({ metric: 'b', limit: 4 })],
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toHaveLength(2);
  });
});

describe('the shipped budgets', () => {
  it('explains every one of them', () => {
    for (const entry of BUDGETS) {
      expect(entry.because.length, entry.metric).toBeGreaterThan(40);
      expect(entry.limit, entry.metric).toBeGreaterThan(0);
    }
  });

  it('names each metric once', () => {
    const names = BUDGETS.map((entry) => entry.metric);
    expect(new Set(names).size).toBe(names.length);
  });
});
