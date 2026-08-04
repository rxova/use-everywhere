import { expect, test, type Page } from '@playwright/test';

/**
 * The fallback chain, in real browsers rather than a simulated hub.
 *
 * `broadcast-channel`'s entire moat is that it works where `BroadcastChannel`
 * does not, and the unit suite can only prove the chain picks the right link
 * because it was handed a fake one. This removes the real global before the
 * page's scripts run, so the library probes and degrades for itself.
 *
 * The case that matters most is the last one: with nothing left, every write
 * still appears to succeed and no peer ever receives it. That is the worst
 * failure this library can have, because it is indistinguishable from working.
 */
const text = (page: Page, id: string) => page.locator(`#${id}`);

const settled = async (page: Page) => {
  await expect(text(page, 'client')).not.toBeEmpty({ timeout: 10_000 });
};

/** Remove globals before any of the page's own scripts evaluate. */
const withoutGlobals = async (page: Page, names: string[]) => {
  await page.addInitScript((toDelete: string[]) => {
    for (const name of toDelete) {
      Object.defineProperty(window, name, { configurable: true, value: undefined });
    }
  }, names);
};

/** Make storage exist but throw on write — Safari's old private mode. */
const withBlockedStorage = async (page: Page) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      },
    });
  });
};

test.describe('when BroadcastChannel is missing', () => {
  test('falls back to the storage event, and still syncs between tabs', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) await withoutGlobals(page, ['BroadcastChannel']);

    await first.goto('/degradation.html');
    await second.goto('/degradation.html');
    await settled(first);
    await settled(second);

    await expect(text(first, 'transport')).toHaveText('storage');

    await second.evaluate(() => {
      (window as unknown as { degradation: { bump(): void } }).degradation.bump();
    });

    // The fallback is only worth having if it actually carries traffic.
    await expect(text(first, 'value')).toHaveText('1', { timeout: 10_000 });

    await first.close();
    await second.close();
  });

  test('sees the other tab in presence over the fallback too', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) await withoutGlobals(page, ['BroadcastChannel']);

    await first.goto('/degradation.html');
    await second.goto('/degradation.html');
    await settled(first);
    await settled(second);

    await expect(text(first, 'peers')).toHaveText('1', { timeout: 10_000 });

    await first.close();
    await second.close();
  });
});

test.describe('when there is nothing left to fall back to', () => {
  test('reports none rather than pretending to be connected', async ({ context }) => {
    const page = await context.newPage();
    await withoutGlobals(page, ['BroadcastChannel']);
    await withBlockedStorage(page);

    await page.goto('/degradation.html');
    await settled(page);

    // The whole point of `getTransportKind`: a tab that can share nothing must
    // be able to say so, because every write will still look like it worked.
    await expect(text(page, 'transport')).toHaveText('none');

    await page.close();
  });

  test('keeps working locally, and tells the console why it is alone', async ({ context }) => {
    const page = await context.newPage();
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await withoutGlobals(page, ['BroadcastChannel']);
    await withBlockedStorage(page);

    await page.goto('/degradation.html');
    await settled(page);

    await page.evaluate(() => {
      (window as unknown as { degradation: { bump(): void } }).degradation.bump();
    });

    // Local writes still work — degradation is not breakage — and the dev
    // build says out loud that nothing is being shared.
    await expect(text(page, 'value')).toHaveText('1');
    expect(warnings.some((w) => w.includes('nothing is shared'))).toBe(true);

    await page.close();
  });

  test('does not count anybody as a peer', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) {
      await withoutGlobals(page, ['BroadcastChannel']);
      await withBlockedStorage(page);
    }

    await first.goto('/degradation.html');
    await second.goto('/degradation.html');
    await settled(first);
    await settled(second);
    await first.waitForTimeout(1_000);

    // Two tabs that cannot hear each other must not claim otherwise.
    await expect(text(first, 'peers')).toHaveText('0');
    await expect(text(second, 'peers')).toHaveText('0');

    await first.close();
    await second.close();
  });
});
