import { defineConfig } from '@playwright/test';

/**
 * These are the assertions unit tests cannot make: a real BroadcastChannel,
 * real tabs, real localStorage, and real timer throttling. Everything runs in
 * one browser context, because separate contexts are separate storage
 * partitions — tabs in different contexts would neither see each other's
 * broadcasts nor share a disk.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tabs share one origin; parallel specs would collide
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @use-everywhere/demo dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
