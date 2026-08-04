import { expect, test, type Page } from '@playwright/test';

/**
 * The rolling-deploy case, end to end. Every deploy puts two generations of the
 * bundle on one origin for as long as it takes users to reload, and they share
 * a bus the whole time. The unit tests prove the envelope check with a
 * `MemoryHub`; this proves it over a real `BroadcastChannel` between real tabs,
 * which is where the wire actually is.
 *
 * The contract has two halves and both are asserted here: a generation we
 * cannot read cannot write to us, and the fact that it exists does not stay a
 * secret.
 */
const text = (page: Page, id: string) => page.locator(`#${id}`);

type SkewSeam = { bump(): void; postAs(v: number, value: number): void };

const settled = async (page: Page) => {
  await expect(text(page, 'client')).not.toBeEmpty({ timeout: 10_000 });
};

const open = async (page: Page) => {
  await page.goto('/skew.html');
  await settled(page);
  return page;
};

test.describe('two generations of the bundle on one origin', () => {
  test('a foreign wire version cannot write to this one', async ({ context }) => {
    const listener = await open(await context.newPage());
    const other = await open(await context.newPage());

    // Same bus, same envelope shape, v2 — and a version clock high enough that
    // last-writer-wins would take it if it ever reached the comparison.
    await other.evaluate(() => {
      (window as unknown as { skew: SkewSeam }).skew.postAs(2, 999);
    });

    // A v1 write straight after, as the delivery control: if this lands and 999
    // did not, the transport is working and the envelope check is what stopped
    // the other one — rather than nothing having arrived at all.
    await other.evaluate(() => {
      (window as unknown as { skew: SkewSeam }).skew.bump();
    });

    await expect(text(listener, 'value')).toHaveText('1', { timeout: 10_000 });

    await listener.close();
    await other.close();
  });

  test('reports the skew rather than hiding it', async ({ context }) => {
    const listener = await open(await context.newPage());
    const other = await open(await context.newPage());

    await expect(text(listener, 'skew')).toBeEmpty();

    await other.evaluate(() => {
      const { skew } = window as unknown as { skew: SkewSeam };
      skew.postAs(2, 1);
      skew.postAs(3, 2);
    });

    // Ascending and deduped: this is what a "reload for the latest version"
    // prompt would be gated on.
    await expect(text(listener, 'skew')).toHaveText('2,3', { timeout: 10_000 });

    await listener.close();
    await other.close();
  });

  test('still syncs with its own generation while skewed', async ({ context }) => {
    const listener = await open(await context.newPage());
    const other = await open(await context.newPage());

    await other.evaluate(() => {
      (window as unknown as { skew: SkewSeam }).skew.postAs(2, 500);
    });
    await expect(text(listener, 'skew')).toHaveText('2', { timeout: 10_000 });

    // Partition is not degradation. Having heard from a generation it cannot
    // read, this tab must go on working normally with the one it can — peers
    // still counted, writes still shared.
    await expect(text(listener, 'peers')).toHaveText('1', { timeout: 10_000 });

    await other.evaluate(() => {
      (window as unknown as { skew: SkewSeam }).skew.bump();
    });
    await expect(text(listener, 'value')).toHaveText('1', { timeout: 10_000 });

    await listener.close();
    await other.close();
  });
});
