import { describe, expect, it } from 'vitest';
import { createScenario } from '../scenario.js';
import { tick } from '../timing.js';

/**
 * The assertion this package exists to make possible: what happens to the seat
 * when the tab holding it dies without saying anything.
 *
 * In a real browser that is a `kill -9`, and the answer comes from the platform
 * — Web Locks releases on tab death, and a lease expires when heartbeats stop.
 * Both paths run here, in one process, in milliseconds.
 */
describe('leadership across a crash', () => {
  it('hands the seat to the next tab when the leader is killed (web locks)', async () => {
    const browser = createScenario();
    const a = browser.tab();
    const b = browser.tab();
    const first = a.leader('app');
    const second = b.leader('app');

    await tick();
    expect(first.getSnapshot().isLeader).toBe(true);
    expect(second.getSnapshot().isLeader).toBe(false);
    // `locks` is a general navigator.locks stand-in, so it is keyed by the lock
    // the leader actually takes — the bus name inside the library's own
    // namespace, not the bare bus name.
    expect(browser.locks.holder('use-everywhere:leader:app')).toBe('tab-1');

    a.crash();
    await tick();

    expect(second.getSnapshot().isLeader).toBe(true);
    browser.dispose();
  });

  it('hands the seat over on a clean close, without waiting for anything', async () => {
    const browser = createScenario();
    const a = browser.tab();
    const b = browser.tab();
    a.leader('app');
    const second = b.leader('app');

    await tick();
    a.close();
    await tick();

    expect(second.getSnapshot().isLeader).toBe(true);
    browser.dispose();
  });

  it('elects exactly one tab under the heartbeat strategy too', async () => {
    const browser = createScenario({ election: 'heartbeat' });
    const leaders = [browser.tab(), browser.tab(), browser.tab()].map((tab) =>
      tab.leader('app', { heartbeatMs: 20, leaseMs: 60 }),
    );

    await browser.settle(120);

    expect(leaders.filter((leader) => leader.getSnapshot().isLeader)).toHaveLength(1);
    browser.dispose();
  });

  it('resolves waitForLeadership in whichever tab inherits the seat', async () => {
    const browser = createScenario();
    const a = browser.tab();
    const b = browser.tab();
    a.leader('app');
    const second = b.leader('app');
    const inherited = second.waitForLeadership();

    await tick();
    a.crash();

    await expect(inherited).resolves.toBeUndefined();
    browser.dispose();
  });
});
