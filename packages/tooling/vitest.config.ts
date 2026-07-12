import { defineConfig } from 'vitest/config';

// No coverage: these tests exercise the scripts as child processes (git repos
// in tmp dirs), which V8 coverage cannot observe.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['*.test.ts'],
  },
});
