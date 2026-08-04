import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      // The suites and the runner are the benchmark: they are executed by
      // `pnpm bench`, against a real BroadcastChannel, and take seconds each.
      // What is unit-tested here is the machinery that turns their output into
      // a verdict — the statistics and the gate — because a benchmark whose
      // percentile is wrong produces a number people go on to quote.
      exclude: ['src/run.ts', 'src/suites/**', 'src/**/*.types.ts', 'src/__tests__/**'],
      thresholds: {
        perFile: true,
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
