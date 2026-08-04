import { expect, test, type Page } from '@playwright/test';

/**
 * A backgrounded tab, for real.
 *
 * Browsers clamp a hidden page's timers to roughly one tick a minute, and every
 * timing decision in this library was written around that: presence probes a
 * quiet peer rather than dropping it, and the Web Locks election holds the seat
 * without a timer at all. None of it can be proven with fake timers, because
 * fake timers are precisely what a throttled tab does not have.
 *
 * Chrome drives freezing through CDP, so these run on Chromium alone — the
 * behaviour under test is a Chrome policy, and the other engines expose no
 * equivalent knob.
 */
const peers = (page: Page) => page.getByTestId('peers');
const leaderStatus = (page: Page) => page.getByTestId('leader-status');
const leaderId = (page: Page) => page.getByTestId('leader-id');
const draft = (page: Page) => page.getByTestId('draft');

const settled = async (page: Page) => {
  await expect(leaderId(page)).not.toBeEmpty({ timeout: 10_000 });
};

test.describe('a throttled tab', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'freezing is driven through CDP, which only Chromium exposes',
  );

  test('is not dropped from the roster for going quiet', async ({ context }) => {
    const watcher = await context.newPage();
    const sleeper = await context.newPage();
    await watcher.goto('/');
    await sleeper.goto('/');
    await settled(watcher);
    await settled(sleeper);
    await expect(peers(watcher)).toHaveAttribute('data-peer-count', '1', { timeout: 10_000 });

    // Frozen the way Chrome freezes a backgrounded tab: timers stop, so the
    // heartbeat stops, and silence is all the watcher has to go on.
    const cdp = await context.newCDPSession(sleeper);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });

    // Well past pruneAfterMs + probeGraceMs. A roster that read silence as
    // death would have dropped this peer several times over by now.
    await watcher.waitForTimeout(8_000);
    await expect(peers(watcher)).toHaveAttribute('data-peer-count', '1');

    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await cdp.detach();
    await watcher.close();
    await sleeper.close();
  });

  test('keeps the leader seat while frozen', async ({ context }) => {
    const leader = await context.newPage();
    await leader.goto('/');
    await settled(leader);
    await expect(leaderStatus(leader)).toContainText('driving', { timeout: 10_000 });
    const incumbent = await leaderId(leader).textContent();

    const follower = await context.newPage();
    await follower.goto('/');
    await settled(follower);
    expect(await leaderId(follower).textContent()).toBe(incumbent);

    const cdp = await context.newCDPSession(leader);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await follower.waitForTimeout(8_000);

    // Holding a Web Lock depends on no timer, so a frozen-but-alive leader
    // keeps the seat. Losing it here would run every useLeaderEffect teardown
    // for a tab that is merely in the background.
    expect(await leaderId(follower).textContent()).toBe(incumbent);
    await expect(leaderStatus(follower)).not.toContainText('driving');

    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await cdp.detach();
    await leader.close();
    await follower.close();
  });

  test('converges on what it missed once it wakes', async ({ context }) => {
    const writer = await context.newPage();
    const sleeper = await context.newPage();
    await writer.goto('/');
    await sleeper.goto('/');
    await settled(writer);
    await settled(sleeper);
    await draft(writer).fill('before');
    await expect(draft(sleeper)).toHaveValue('before', { timeout: 10_000 });

    const cdp = await context.newCDPSession(sleeper);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });

    await draft(writer).fill('written while asleep');

    await cdp.send('Page.setWebLifecycleState', { state: 'active' });

    // Waking up holding a stale value is the failure that matters: it looks
    // exactly like working software until somebody compares two tabs.
    await expect(draft(sleeper)).toHaveValue('written while asleep', { timeout: 10_000 });

    await cdp.detach();
    await writer.close();
    await sleeper.close();
  });

  test('re-announces on return, so peers that gave up re-add it', async ({ context }) => {
    const watcher = await context.newPage();
    const sleeper = await context.newPage();
    await watcher.goto('/');
    await sleeper.goto('/');
    await settled(watcher);
    await settled(sleeper);
    await expect(peers(watcher)).toHaveAttribute('data-peer-count', '1', { timeout: 10_000 });

    const cdp = await context.newCDPSession(sleeper);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await watcher.waitForTimeout(2_000);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });

    // Message handlers are not throttled, only timers are — which is why a
    // returning tab announces itself rather than waiting out its own next tick.
    await expect(peers(watcher)).toHaveAttribute('data-peer-count', '1', { timeout: 3_000 });

    await cdp.detach();
    await watcher.close();
    await sleeper.close();
  });
});
