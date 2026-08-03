import { expect, test, type Page } from '@playwright/test';

const draft = (page: Page) => page.getByTestId('draft');
const leaderId = (page: Page) => page.getByTestId('leader-id');

const settled = (page: Page) => expect(leaderId(page)).not.toBeEmpty({ timeout: 10_000 });

/**
 * Navigating away and coming Back does not necessarily reload: the browser can
 * freeze the page and thaw it later (the back/forward cache). A frozen tab
 * hears nothing, and it announced `bye` on the way out — so without a rejoin on
 * restore it would come back holding stale state and a seat it had given up.
 *
 * What this suite asserts is the *user-visible* guarantee: after going Back,
 * this tab agrees with the tabs that stayed. That has to hold whether the
 * browser used bfcache or reloaded the page, and the three engines differ on
 * when they use it — an assertion that only holds under bfcache would be a
 * different test in every browser. Where the restore *was* served from cache,
 * the run also exercises the `pageshow`/`persisted` path directly; the unit
 * suite pins that handler deterministically.
 */
test.describe('returning to a page after navigating away', () => {
  test('the returning tab converges on what changed while it was gone', async ({ context }) => {
    const traveller = await context.newPage();
    await traveller.goto('/');
    await draft(traveller).fill('before leaving');

    const stayer = await context.newPage();
    await stayer.goto('/');
    await expect(draft(stayer)).toHaveValue('before leaving');

    // Away. Same origin, so the page stays eligible for the cache.
    await traveller.goto('/payment.html');
    await expect(traveller.getByText('Secure payment')).toBeVisible();

    // While it is away, the other tab moves the world on.
    await draft(stayer).fill('changed while you were out');

    await traveller.goBack();

    // The guarantee: back in the app, this tab is not living in the past.
    await expect(draft(traveller)).toHaveValue('changed while you were out', { timeout: 10_000 });

    await traveller.close();
    await stayer.close();
  });

  test('a returning tab rejoins the election instead of holding a phantom seat', async ({
    context,
  }) => {
    const traveller = await context.newPage();
    await traveller.goto('/');
    await settled(traveller);

    const stayer = await context.newPage();
    await stayer.goto('/');
    await settled(stayer);

    await traveller.goto('/payment.html');
    await expect(traveller.getByText('Secure payment')).toBeVisible();
    await traveller.goBack();
    await settled(traveller);

    // Both tabs are live, so exactly one crown between them, and they agree
    // on whose it is. A tab that came back believing it still led — or that
    // never rejoined at all — fails here.
    const ids = await Promise.all(
      [leaderId(traveller), leaderId(stayer)].map((l) => l.textContent()),
    );
    expect(new Set(ids).size).toBe(1);

    const driving = await Promise.all(
      [traveller, stayer].map((p) =>
        p
          .getByTestId('leader-status')
          .textContent()
          .then((s) => s?.includes('driving') ?? false),
      ),
    );
    expect(driving.filter(Boolean)).toHaveLength(1);

    await traveller.close();
    await stayer.close();
  });
});
