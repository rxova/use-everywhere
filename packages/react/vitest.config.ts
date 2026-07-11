import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true, // lets @testing-library/react auto-cleanup between tests
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
