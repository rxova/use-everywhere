import { defineConfig, devices } from '@playwright/test';

/**
 * These are the assertions unit tests cannot make: a real BroadcastChannel,
 * real tabs, real localStorage, and real timer throttling. Everything runs in
 * one browser context, because separate contexts are separate storage
 * partitions — tabs in different contexts would neither see each other's
 * broadcasts nor share a disk.
 *
 * Three engines, not one. Everything here rests on `BroadcastChannel`,
 * `pagehide`/`pageshow`, storage partitioning and popup handling — precisely
 * the areas where the engines diverge, and where a Chromium-only suite proves
 * the least. Select one with `--project=webkit` while debugging; CI runs all
 * three as separate jobs so a WebKit failure is legible on its own.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tabs share one origin; parallel specs would collide
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  use: {
    // Not Vite's default 5173. `reuseExistingServer` means a stray dev server
    // on that port gets adopted silently, and the suite then asserts against
    // whatever app happens to be running — which has already produced a full
    // sweep of false failures more than once. A dedicated port makes reuse
    // safe again, and --strictPort turns a genuine collision into a loud
    // startup error instead of ten mystifying assertion failures.
    baseURL: 'http://localhost:5179',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @use-everywhere/demo dev --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
