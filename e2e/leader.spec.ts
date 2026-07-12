import { expect, test, type Page } from '@playwright/test';

const status = (page: Page) => page.getByTestId('leader-status');
const leaderId = (page: Page) => page.getByTestId('leader-id');

/** Wait until this tab has settled on some leader — its own or somebody else's. */
async function settled(page: Page) {
  await expect(leaderId(page)).not.toBeEmpty({ timeout: 10_000 });
}

test.describe('leader election, in real tabs', () => {
  test('exactly one tab drives, and the rest follow it', async ({ context }) => {
    const tabs = [await context.newPage(), await context.newPage(), await context.newPage()];
    for (const tab of tabs) await tab.goto('/');
    for (const tab of tabs) await settled(tab);

    // Exactly one crown across three real tabs.
    const driving = await Promise.all(
      tabs.map((t) =>
        status(t)
          .textContent()
          .then((s) => s?.includes('driving') ?? false),
      ),
    );
    expect(driving.filter(Boolean)).toHaveLength(1);

    // And all three agree on who it is.
    const ids = await Promise.all(tabs.map((t) => leaderId(t).textContent()));
    expect(new Set(ids).size).toBe(1);

    for (const tab of tabs) await tab.close();
  });

  test('a new tab does not steal the seat', async ({ context }) => {
    const first = await context.newPage();
    await first.goto('/');
    await settled(first);
    await expect(status(first)).toContainText('driving');
    const incumbent = await leaderId(first).textContent();

    // Open two more. The sticky-incumbent property says the crown stays put —
    // this is the whole reason leadership is not derived from min(clientId).
    const second = await context.newPage();
    await second.goto('/');
    await settled(second);
    const third = await context.newPage();
    await third.goto('/');
    await settled(third);

    await expect(status(first)).toContainText('driving');
    expect(await leaderId(second).textContent()).toBe(incumbent);
    expect(await leaderId(third).textContent()).toBe(incumbent);

    for (const tab of [first, second, third]) await tab.close();
  });

  test('closing the leader hands over immediately, not after a lease', async ({ context }) => {
    const leader = await context.newPage();
    await leader.goto('/');
    await settled(leader);
    await expect(status(leader)).toContainText('driving');

    const survivor = await context.newPage();
    await survivor.goto('/');
    await settled(survivor);
    await expect(status(survivor)).toContainText('following');

    const start = Date.now();
    await leader.close(); // fires pagehide -> resign

    await expect(status(survivor)).toContainText('driving', { timeout: 3_000 });
    const elapsed = Date.now() - start;

    // The resign path, not the 3s lease. Allow slack for the round trip and a
    // React commit, but this must be nowhere near a lease.
    expect(elapsed).toBeLessThan(2_000);

    await survivor.close();
  });

  test('only the leading tab advances the ticker', async ({ context }) => {
    const leader = await context.newPage();
    await leader.goto('/');
    await settled(leader);
    await expect(status(leader)).toContainText('driving');

    const follower = await context.newPage();
    await follower.goto('/');
    await settled(follower);

    const before = Number(await leader.getByTestId('ticks').textContent());
    await leader.waitForTimeout(2_500);
    const after = Number(await leader.getByTestId('ticks').textContent());

    // One interval, not two: the count rises by roughly the seconds elapsed. If
    // both tabs ran the interval it would climb about twice as fast.
    const delta = after - before;
    expect(delta).toBeGreaterThanOrEqual(1);
    expect(delta).toBeLessThanOrEqual(4);

    // Both tabs show the same number — the follower reads what the leader wrote.
    expect(await follower.getByTestId('ticks').textContent()).toBe(String(after));

    for (const tab of [leader, follower]) await tab.close();
  });

  test('a tab that opts out never takes the seat', async ({ context }) => {
    const bystander = await context.newPage();
    await bystander.goto('/');
    await settled(bystander);

    await bystander.getByTestId('eligible').uncheck();

    // It was leading, so opting out must move the crown off it — and with no
    // other tab open, the seat simply stays empty.
    await expect(status(bystander)).not.toContainText('driving', { timeout: 5_000 });

    // Opt back in and it takes the empty seat again.
    await bystander.getByTestId('eligible').check();
    await expect(status(bystander)).toContainText('driving', { timeout: 5_000 });

    await bystander.close();
  });
});
