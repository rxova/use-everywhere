// @vitest-environment happy-dom
// Needs a page: the whole subject is what several copies of the library do when
// they share one, and the rendezvous point is `globalThis`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '../bus.js';
import { createLeader } from '../leader.js';
import { createPresence } from '../presence.js';
import { resetRendezvous } from '../rendezvous.js';
import { createSharedStore } from '../shared-store.js';

/**
 * Two micro-frontends on one page, each having bundled its own copy of this
 * library, is the case M3 exists for. `vi.resetModules()` reproduces it
 * honestly: a second module registry, evaluated fresh, sharing one `globalThis`
 * — which is exactly what two bundles are.
 *
 * Before the rendezvous table, each copy built its own bus and its own clientId,
 * so one page appeared to its peers as two tabs, contended with itself for the
 * leader seat, and could not share state *within itself* at all — a post goes to
 * the transport, and no transport loops back to the context that made it.
 */
async function secondCopy() {
  vi.resetModules();
  return {
    bus: await import('../bus.js'),
    store: await import('../shared-store.js'),
    leader: await import('../leader.js'),
    presence: await import('../presence.js'),
  };
}

describe('two copies of the library on one page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRendezvous();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('are one client, not two', async () => {
    const b = await secondCopy();

    const mine = getBus('mi-identity');
    const theirs = b.bus.getBus('mi-identity');

    // A second clientId here is a second presence dot for one page, and a
    // second candidate for a seat that is supposed to be per-page.
    expect(theirs.clientId).toBe(mine.clientId);

    mine.release();
    theirs.release();
  });

  it('share state between them, synchronously', async () => {
    const b = await secondCopy();

    const mine = createSharedStore<{ n: number }>('mi-state', { n: 0 });
    const theirs = b.store.createSharedStore('mi-state', { n: 0 }) as ReturnType<
      typeof createSharedStore<{ n: number }>
    >;

    mine.set('n', 7);

    // No await. A sibling on this page sees the write in the same task, rather
    // than after a BroadcastChannel round trip — the difference between two
    // micro-frontends sharing state and merely converging on it eventually.
    expect(theirs.getSnapshot().n).toBe(7);

    // And back the other way, so neither copy is privileged by load order.
    theirs.set('n', 9);
    expect(mine.getSnapshot().n).toBe(9);

    mine.close();
    theirs.close();
  });

  it('do not count each other as peers', async () => {
    // Real timers, and that is load-bearing: happy-dom's BroadcastChannel does
    // not deliver while timers are faked, so under fake timers two *separate*
    // buses would also report no peers and this would pass without proving
    // anything. The delivery being real is the whole point of the assertion.
    vi.useRealTimers();
    const b = await secondCopy();

    const mine = createPresence('mi-peers');
    const theirs = b.presence.createPresence('mi-peers');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // One page, one entry. Seeing "1 other tab" while alone in the browser is
    // the symptom this whole mechanism removes.
    expect(mine.getPeers()).toEqual([]);
    expect(theirs.getPeers()).toEqual([]);

    mine.close();
    theirs.close();
  });

  it('elect one leader between them, not one each', async () => {
    const b = await secondCopy();

    const mine = createLeader('mi-leader', { strategy: 'heartbeat' });
    const theirs = b.leader.createLeader('mi-leader', { strategy: 'heartbeat' });
    await vi.advanceTimersByTimeAsync(2_000);

    // Both hold it, because both *are* it: one client, one seat. What must not
    // happen is a page deposing itself, or two copies running the same
    // singleton work because each believes it won.
    expect(mine.getSnapshot().leaderId).toBe(theirs.getSnapshot().leaderId);
    expect(mine.getSnapshot().isLeader).toBe(true);
    expect(theirs.getSnapshot().isLeader).toBe(true);

    mine.close();
    theirs.close();
  });

  it('release independently — one copy closing does not cut the other off', async () => {
    const b = await secondCopy();

    const mine = createSharedStore<{ n: number }>('mi-refs', { n: 0 });
    const theirs = b.store.createSharedStore('mi-refs', { n: 0 }) as ReturnType<
      typeof createSharedStore<{ n: number }>
    >;

    // A shared bus with a naive refcount would shut down here and leave the
    // surviving copy holding a dead transport that silently accepts writes.
    mine.close();

    theirs.set('n', 3);
    expect(theirs.getSnapshot().n).toBe(3);

    theirs.close();
  });

  it('rebuild the bus after the last copy has gone', async () => {
    const first = getBus('mi-rebuild');
    const firstId = first.clientId;
    first.release();

    // The table must drop a bus at refcount zero, or a page that tore
    // everything down would reattach to a closed transport.
    const second = getBus('mi-rebuild');
    expect(second.clientId).not.toBe(firstId);
    second.release();
  });
});

describe('copies that cannot understand each other', () => {
  beforeEach(() => resetRendezvous());
  afterEach(() => vi.restoreAllMocks());

  it('say so, rather than partitioning in silence', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A copy compiled against a future rendezvous shape got here first.
    (globalThis as Record<symbol, unknown>)[Symbol.for('use-everywhere.rendezvous.census')] = {
      protocols: [99],
    };

    const bus = getBus('mi-skew');

    // The two copies still sync over the bus — they just cost an extra presence
    // entry and lose synchronous delivery. That is a trade-off worth naming,
    // not a silent degradation.
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/two incompatible versions/);
    bus.release();
  });
});
