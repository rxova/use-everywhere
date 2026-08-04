/**
 * The regression gate.
 *
 * Every budget is a **ratio against a baseline measured in the same run**, never
 * an absolute time. A CI runner's speed varies by more than any regression this
 * would catch — it is shared, it is throttled, and it is a different machine
 * every time — so an absolute millisecond budget produces a red build that
 * means nothing, which is how people learn to ignore a gate.
 *
 * "This library costs at most 2.5× a raw BroadcastChannel" survives a slow
 * runner, because a slow runner slows the baseline too.
 */

export type Comparison = 'at-most' | 'at-least';

export interface Budget {
  readonly metric: string;
  readonly comparison: Comparison;
  readonly limit: number;
  /** Why this number, in one line. Printed with a failure. */
  readonly because: string;
}

export interface Reading {
  readonly metric: string;
  readonly value: number;
}

export interface GateResult {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

const passes = (value: number, budget: Budget): boolean =>
  budget.comparison === 'at-most' ? value <= budget.limit : value >= budget.limit;

/**
 * Check every budget against the run.
 *
 * A budget with no reading fails. A benchmark that silently stopped running is
 * the one failure mode a gate must never report as green.
 */
export function checkBudgets(readings: readonly Reading[], budgets: readonly Budget[]): GateResult {
  const byMetric = new Map(readings.map((reading) => [reading.metric, reading.value]));
  const lines: string[] = [];
  let ok = true;

  for (const budget of budgets) {
    const value = byMetric.get(budget.metric);
    if (value === undefined) {
      ok = false;
      lines.push(`  ✖ ${budget.metric}: not measured — did the suite stop running?`);
      continue;
    }
    const verdict = passes(value, budget);
    ok &&= verdict;
    const sign = budget.comparison === 'at-most' ? '≤' : '≥';
    lines.push(
      `  ${verdict ? '✔' : '✖'} ${budget.metric}: ${value.toFixed(2)} ${sign} ${budget.limit}` +
        (verdict ? '' : `\n      ${budget.because}`),
    );
  }

  return { ok, lines };
}
