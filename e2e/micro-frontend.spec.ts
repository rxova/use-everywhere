import { expect, test, type Page } from '@playwright/test';

/**
 * The end-to-end half of the multi-instance work. The unit tests simulate two
 * bundles with `vi.resetModules()`, which is faithful but is still one process
 * with one module loader — this is the real thing: two files built by two
 * separate Vite invocations, each carrying its own inlined copy of the core,
 * loaded by two script tags on one page. Neither was compiled knowing the other
 * exists, which is what two teams shipping two micro-frontends actually means.
 *
 * Without a rendezvous point outside the module graph, each copy builds its own
 * bus: the page shows up to its peers as two tabs, elects itself twice, and
 * cannot share state with itself at all.
 */
const text = (page: Page, id: string) => page.locator(`#${id}`);

const settled = async (page: Page) => {
  await expect(text(page, 'a-client')).not.toBeEmpty({ timeout: 10_000 });
  await expect(text(page, 'b-client')).not.toBeEmpty({ timeout: 10_000 });
};

test.describe('two independently built bundles on one page', () => {
  test('are one client, with one identity', async ({ page }) => {
    await page.goto('/mfe.html');
    await settled(page);

    const a = await text(page, 'a-client').textContent();
    const b = await text(page, 'b-client').textContent();

    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  test('do not count each other as peers', async ({ page }) => {
    await page.goto('/mfe.html');
    await settled(page);
    // Long enough for several heartbeats: if the two copies were separate
    // clients they would have found each other many times over by now.
    await page.waitForTimeout(3_000);

    await expect(text(page, 'a-peers')).toHaveText('0');
    await expect(text(page, 'b-peers')).toHaveText('0');
  });

  test('share a write in the same task, not a round trip later', async ({ page }) => {
    await page.goto('/mfe.html');
    await settled(page);

    // Bump in bundle A and read bundle B's DOM without yielding. A transport
    // round trip cannot possibly have happened; only synchronous local delivery
    // can make this pass.
    const seenImmediately = await page.evaluate(() => {
      (window as unknown as Record<string, { bump(): void }>).mfe_a.bump();
      return document.getElementById('b-value')?.textContent;
    });

    expect(seenImmediately).toBe('1');

    // And back the other way, so neither bundle is privileged by load order.
    const backAgain = await page.evaluate(() => {
      (window as unknown as Record<string, { bump(): void }>).mfe_b.bump();
      return document.getElementById('a-value')?.textContent;
    });

    expect(backAgain).toBe('2');
  });

  test('hold one leader seat between them', async ({ page }) => {
    await page.goto('/mfe.html');
    await settled(page);
    await expect(text(page, 'a-leader')).toHaveText('yes', { timeout: 10_000 });

    // Both report the seat because both *are* the client that holds it. What
    // must not happen is one copy deposing the other, which is what two
    // candidates on one page produces — and would run any singleton work twice.
    await expect(text(page, 'b-leader')).toHaveText('yes');
  });

  test('are still one client as seen from a genuinely separate tab', async ({ context }) => {
    const mfe = await context.newPage();
    await mfe.goto('/mfe.html');
    await settled(mfe);

    const observer = await context.newPage();
    await observer.goto('/');

    // The outside view is the one that matters: a real second tab must see the
    // two-bundle page as exactly one peer, not two.
    await expect(observer.getByTestId('peers')).toHaveAttribute('data-peer-count', '1', {
      timeout: 10_000,
    });
  });
});
