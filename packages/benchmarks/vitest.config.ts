import { baseVitestConfig } from '@rxova/repo-config/vitest';

export default baseVitestConfig({
  root: import.meta.dirname,
  // The suites and the runner are the benchmark: they are executed by
  // `pnpm bench`, against a real BroadcastChannel, and take seconds each.
  // What is unit-tested here is the machinery that turns their output into
  // a verdict — the statistics and the gate — because a benchmark whose
  // percentile is wrong produces a number people go on to quote.
  exclude: ['src/run.ts', 'src/suites/**', 'src/__tests__/**'],
});
