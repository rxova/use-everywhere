import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // `text` for a human reading CI logs, `lcov` for Codecov: the diff-coverage
      // gate needs a machine-readable report per package, and v8's default is
      // neither written to disk nor mergeable.
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      // `cli.ts` is the process entry: it reads argv and exits, which is exactly
      // what a unit test cannot run in-process. `main.ts` behind it is tested.
      exclude: ['src/index.ts', 'src/cli.ts', 'src/**/*.types.ts', 'src/__tests__/**'],
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
