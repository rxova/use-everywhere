import { expect, test, type Page } from '@playwright/test';

/**
 * "Workers" is in the tagline, and until now it was proven only by unit tests
 * that *called* something a worker. This drives a real dedicated worker in a
 * real browser: a separate thread, its own copy of the core, no DOM at all.
 *
 * The interesting part is how it leaves. A worker has two exits and only one of
 * them is polite:
 *
 * - `postMessage('stop')` → the worker closes its store, which says `bye`, and
 *   peers drop it in one round trip.
 * - `terminate()` → the thread stops mid-instruction. Nothing runs, so nothing
 *   is announced. There is no `pagehide` for a worker and no event fires on the
 *   page either; the platform simply gives no notification that a worker died.
 *
 * That second case is why presence cannot rely on goodbyes, and it is the one
 * worth pinning: the dot must go *eventually* and must not go *instantly*,
 * because "instantly" would mean presence was dropping healthy peers too.
 */

const peers = (page: Page) => page.getByTestId('peers');
const workerCount = async (page: Page) =>
  Number(await peers(page).getAttribute('data-worker-count'));

const seesWorkers = (page: Page, n: number) =>
  expect(peers(page)).toHaveAttribute('data-worker-count', String(n), { timeout: 10_000 });

test.describe('a dedicated worker on the bus', () => {
  test('joins presence as a worker and writes state the page sees', async ({ page }) => {
    await page.goto('/');
    await expect(peers(page)).toHaveAttribute('data-worker-count', '0');

    await page.getByTestId('toggle-worker').click();

    // It announced itself, and the page knows it is a worker rather than a tab
    // — the kind is inferred from the absence of `document`, not configured.
    await seesWorkers(page, 1);

    // And it is genuinely running the library, not just connected: this counter
    // only moves if the worker's writes converge into the page's store.
    await expect(page.getByTestId('worker-ticks')).not.toHaveText('0', { timeout: 10_000 });

    await page.getByTestId('toggle-worker').click();
    await seesWorkers(page, 0);
  });

  test('a worker asked to stop says goodbye, and goes at once', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('toggle-worker').click();
    await seesWorkers(page, 1);

    const start = Date.now();
    await page.getByTestId('toggle-worker').click();
    await seesWorkers(page, 0);

    // One round trip on a same-origin channel. The point of the assertion is
    // the contrast with the next test, so the bound is deliberately loose —
    // anything under the prune window proves a goodbye was heard.
    expect(Date.now() - start).toBeLessThan(3_000);
  });

  test('a terminated worker leaves no goodbye, and is timed out instead', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('toggle-worker').click();
    await seesWorkers(page, 1);

    const start = Date.now();
    await page.getByTestId('kill-worker').click();

    // Still there immediately after: nothing announced its death, and presence
    // does not guess. A failure here would mean peers vanish on silence alone,
    // which is what made backgrounded tabs flicker.
    expect(await workerCount(page)).toBe(1);

    // It is asked to speak up, cannot, and is dropped: pruneAfterMs (5s) plus
    // probeGraceMs (1s), with room for the tick interval and a slow CI runner.
    await seesWorkers(page, 0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(3_000);
    expect(elapsed).toBeLessThan(15_000);
  });

  test('another tab sees the worker too — it is on the bus, not in one page', async ({
    context,
  }) => {
    const owner = await context.newPage();
    await owner.goto('/');
    const watcher = await context.newPage();
    await watcher.goto('/');

    await owner.getByTestId('toggle-worker').click();

    // The watcher never created the worker and cannot reach it, but shares the
    // origin — which is the whole claim behind "tabs, windows, and workers".
    await seesWorkers(watcher, 1);

    await owner.getByTestId('toggle-worker').click();
    await seesWorkers(watcher, 0);
  });
});
