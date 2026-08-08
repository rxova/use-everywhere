import { expect, test, type Page } from '@playwright/test';

/**
 * The SharedWorker relay, in real browsers — the one transport that shipped
 * without a spec here.
 *
 * What is under test is not fan-out. `BroadcastChannel` already does that, and
 * does it better. It is the thing a SharedWorker can do that no tab can: hold
 * the connection somewhere the user cannot close. The fixture makes that
 * observable by minting a `socketId` once, when the worker starts, so two tabs
 * agreeing on it means they reached the same worker, and the id surviving a tab
 * closing means the connection did too.
 *
 * Three engines matter here more than usual. `SharedWorker` is the API with the
 * least uniform history of anything this library touches — dropped and restored
 * in WebKit, still absent on Chrome for Android — so a Chromium-only pass would
 * prove close to nothing.
 *
 * Every tab in a test shares one browser context on purpose: separate contexts
 * are separate storage partitions, and a SharedWorker does not cross one. Two
 * tabs in different contexts would each get their own worker, which is the
 * failure this whole file is meant to detect.
 */

const text = (page: Page, id: string) => page.locator(`#${id}`);

const socketOf = async (page: Page) => {
  await expect(text(page, 'socket')).not.toBeEmpty({ timeout: 10_000 });
  return text(page, 'socket').textContent();
};

const tickOf = async (page: Page) => Number(await text(page, 'tick').textContent());

/** Waits for the worker's next publish to land in this tab. */
const advanced = async (page: Page, from: number) =>
  expect.poll(async () => tickOf(page), { timeout: 10_000 }).toBeGreaterThan(from);

test.describe('a SharedWorker that owns the connection', () => {
  test('is actually on the SharedWorker wire, not a fallback', async ({ page }) => {
    await page.goto('/relay.html');

    // First, because every other assertion in this file would pass just as
    // happily over BroadcastChannel. If the transport ever degrades silently,
    // this is the only line that notices.
    await expect(text(page, 'transport')).toHaveText('shared-worker');
  });

  test('publishes over the relay it is hosting, to a tab that never writes', async ({ page }) => {
    await page.goto('/relay.html');

    // Nothing on the page writes to this store. A moving counter means the
    // worker reached the tab through `relay.connect()` — the seat that did not
    // exist before, and the reason a hosted relay can now speak at all.
    await expect(text(page, 'tick')).not.toHaveText('0', { timeout: 10_000 });
  });

  test('is one connection for the origin, not one per tab', async ({ page, context }) => {
    await page.goto('/relay.html');
    const first = await socketOf(page);

    const second = await context.newPage();
    await second.goto('/relay.html');

    // Same id, so the same worker. Two tabs that had each spawned their own
    // would be on two relays with two port sets, holding two ids that cannot
    // converge — which is precisely the N-sockets-for-N-tabs bug the transport
    // exists to prevent.
    expect(await socketOf(second)).toBe(first);

    // Distinct clients on that one wire, though. Sharing a worker must not mean
    // sharing an identity.
    expect(await text(second, 'client').textContent()).not.toBe(
      await text(page, 'client').textContent(),
    );
  });

  test('hands its state to a tab that arrives late', async ({ page, context }) => {
    await page.goto('/relay.html');
    const first = await socketOf(page);

    // `socketId` was written once, when the worker started, and is never
    // re-broadcast. A tab opening now can only learn it by asking — so this is
    // the late-joiner handshake travelling over the relay rather than over a
    // BroadcastChannel, which is the path that had no coverage.
    const late = await context.newPage();
    await late.goto('/relay.html');
    expect(await socketOf(late)).toBe(first);
  });

  test('survives the tab that opened it', async ({ page, context }) => {
    await page.goto('/relay.html');
    const opener = await socketOf(page);

    const other = await context.newPage();
    await other.goto('/relay.html');
    await expect(text(other, 'socket')).toHaveText(opener ?? '', { timeout: 10_000 });

    // The tab that spawned the worker goes away. Under leader election this is
    // the moment the connection is dropped and re-established somewhere else.
    await page.close();

    // Here it is not: the same worker keeps publishing to the tab still open.
    // A changed id would mean a fresh worker, which is the same thing as a
    // reconnect — the cost this transport is chosen to avoid.
    await advanced(other, await tickOf(other));
    await expect(text(other, 'socket')).toHaveText(opener ?? '');
  });
});
