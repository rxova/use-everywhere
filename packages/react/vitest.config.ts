import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true, // lets @testing-library/react auto-cleanup between tests
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // `text` for a human reading CI logs, `lcov` for Codecov: the diff-coverage
      // gate needs a machine-readable report per package, and v8's default is
      // neither written to disk nor mergeable.
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/index.ts', 'src/**/*.types.ts', 'src/__tests__/**'],
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
