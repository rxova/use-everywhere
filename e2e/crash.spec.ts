import { expect, test, type Page } from '@playwright/test';

const status = (page: Page) => page.getByTestId('leader-status');
const leaderId = (page: Page) => page.getByTestId('leader-id');

const settled = (page: Page) => expect(leaderId(page)).not.toBeEmpty({ timeout: 10_000 });

/**
 * Closing a tab is the *polite* case: `pagehide` fires, the leader resigns, and
 * the seat moves in one round trip. `leader.spec.ts` covers that.
 *
 * A crashed tab says nothing. The seat has to come back through lease expiry
 * instead — the path that keeps a killed renderer, a force-quit, or an OOM from
 * parking leadership forever. It was covered only by unit tests with fake
 * timers; this drives it in a real browser.
 *
 * Simulated by suppressing the library's `pagehide` registration in one tab
 * before any app code runs, so when that tab goes away it makes no farewell.
 * Playwright has no portable "crash this renderer" (CDP's `Page.crash` is
 * Chromium-only), and what matters is the *silence*, which this reproduces
 * exactly — in all three engines.
 */
async function makeItVanishSilently(page: Page) {
  await page.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).addEventListener = (type: string, ...rest: unknown[]) => {
      if (type === 'pagehide') return; // a crash leaves no goodbye
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any)(type, ...rest);
    };
  });
}

test.describe('a leader that crashes, rather than closing', () => {
  test('the seat comes back through lease expiry', async ({ context }) => {
    const doomed = await context.newPage();
    await makeItVanishSilently(doomed);
    await doomed.goto('/');
    await settled(doomed);
    await expect(status(doomed)).toContainText('driving');
    const crashedId = await leaderId(doomed).textContent();

    const survivor = await context.newPage();
    await survivor.goto('/');
    await settled(survivor);
    // Sticky incumbent: the second tab follows rather than stealing.
    expect(await leaderId(survivor).textContent()).toBe(crashedId);

    await doomed.close(); // silently — no resign on the wire

    // Nobody was told, so the survivor waits out the lease and then claims it.
    // The generous ceiling is deliberate: the assertion is that recovery
    // *happens*, not that it happens within some exact number of milliseconds,
    // which would only measure CI's timer jitter.
    await expect(status(survivor)).toContainText('driving', { timeout: 15_000 });
    expect(await leaderId(survivor).textContent()).not.toBe(crashedId);

    await survivor.close();
  });

  test('the last tab standing takes the seat even if every peer crashed', async ({ context }) => {
    const first = await context.newPage();
    await makeItVanishSilently(first);
    await first.goto('/');
    await settled(first);

    const second = await context.newPage();
    await makeItVanishSilently(second);
    await second.goto('/');
    await settled(second);

    const survivor = await context.newPage();
    await survivor.goto('/');
    await settled(survivor);

    await first.close();
    await second.close();

    await expect(status(survivor)).toContainText('driving', { timeout: 15_000 });
    await survivor.close();
  });
});
