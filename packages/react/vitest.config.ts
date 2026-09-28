import { mergeConfig } from 'vitest/config';
import { baseVitestConfig } from '@rxova/repo-config/vitest';

export default mergeConfig(
  baseVitestConfig({
    root: import.meta.dirname,
    environment: 'happy-dom',
    exclude: ['src/__tests__/**'],
  }),
  // Lets @testing-library/react auto-cleanup between tests.
  { test: { globals: true } },
);
