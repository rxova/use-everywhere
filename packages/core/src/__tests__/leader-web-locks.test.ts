import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLeader } from '../leader.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { FakeLockManager } from './helpers/fake-locks.js';
import { tick } from './helpers/tick.js';

/**
 * The strategy that exists because the heartbeat one cannot tell a dead tab
 * from a throttled one. Here the browser owns the queue, so there is no lease
 * to lose and nothing for a background timer to get wrong.
 */
describe('leader election on Web Locks', () => {
  const setup = () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const tab = (options: { eligible?: boolean } = {}) =>
      createLeader('wl', { transport: () => hub.connect(), locks, ...options });
    return { hub, locks, tab };
  };

  afterEach(() => vi.restoreAllMocks());

  it('is chosen automatically when navigator.locks exists, and reports itself', () => {
    const { tab } = setup();
    const leader = tab();
    expect(leader.strategy).toBe('web-locks');
    leader.close();
  });

  it('falls back to the heartbeat election where Web Locks is absent', () => {
    // A plain-http origin: navigator.locks is a secure-context API, so this is
    // the common case on an intranet, not an exotic one.
    const hub = new MemoryHub();
    const leader = createLeader('wl-fallback', { transport: () => hub.connect() });
    expect(leader.strategy).toBe('heartbeat');
    leader.close();
  });

  it('refuses to pretend when web-locks is demanded and unavailable', () => {
    const hub = new MemoryHub();
    expect(() =>
      createLeader('wl-demand', { transport: () => hub.connect(), strategy: 'web-locks' }),
    ).toThrow(/secure context/);
  });

  it('honours an explicit heartbeat request even where locks exist', () => {
    const { hub, locks } = setup();
    const leader = createLeader('wl-explicit', {
      transport: () => hub.connect(),
      locks,
      strategy: 'heartbeat',
    });
    expect(leader.strategy).toBe('heartbeat');
    leader.close();
  });

  it('seats exactly one tab, and the others follow it', async () => {
    const { locks, tab } = setup();
    const a = tab();
    const b = tab();
    const c = tab();
    await tick();

    expect([a, b, c].filter((l) => l.getSnapshot().isLeader)).toHaveLength(1);
    expect(locks.isHeld('wl')).toBe(true);
    expect(locks.queued('wl')).toBe(2); // the followers are waiting, not polling

    // And everyone agrees who it is — the lock grants, the bus announces.
    const ids = [a, b, c].map((l) => l.getSnapshot().leaderId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(a.clientId);

    for (const l of [a, b, c]) l.close();
  });

  it('hands the seat to the next in line the moment the holder closes', async () => {
    const { tab } = setup();
    const first = tab();
    const second = tab();
    await tick();
    expect(first.getSnapshot().isLeader).toBe(true);

    first.close();
    await tick();

    // No lease to wait out: the browser released the lock, the queue moved on.
    expect(second.getSnapshot().isLeader).toBe(true);
    second.close();
  });

  it('waitForLeadership resolves on acquiring the seat, and at once if already held', async () => {
    const { tab } = setup();
    const first = tab();
    const second = tab();
    await tick();

    await expect(first.waitForLeadership()).resolves.toBeUndefined();

    let seated = false;
    const waiting = second.waitForLeadership().then(() => (seated = true));
    await tick();
    expect(seated).toBe(false); // still queued behind the first tab

    first.close();
    await waiting;
    expect(seated).toBe(true);

    second.close();
  });

  it('waitForLeadership rejects rather than hanging when the tab is torn down', async () => {
    const { tab } = setup();
    const holder = tab();
    const waiter = tab();
    await tick();

    const pending = waiter.waitForLeadership();
    waiter.close();

    await expect(pending).rejects.toThrow(/closed/);
    await expect(waiter.waitForLeadership()).rejects.toThrow(/closed/);
    holder.close();
  });

  it('resign moves the seat to a waiting tab', async () => {
    const { tab } = setup();
    const first = tab();
    const second = tab();
    await tick();
    expect(first.getSnapshot().isLeader).toBe(true);

    first.resign();
    await tick();

    expect(second.getSnapshot().isLeader).toBe(true);
    expect(first.getSnapshot().isLeader).toBe(false);

    first.close();
    second.close();
  });

  it('a lone tab that resigns takes the seat back — somebody has to hold it', async () => {
    const { tab } = setup();
    const only = tab();
    await tick();
    expect(only.getSnapshot().isLeader).toBe(true);

    only.resign();
    await tick();

    // Nowhere for the seat to go. Re-queuing hands it straight back, which is
    // the documented difference from the heartbeat strategy's lease pause.
    expect(only.getSnapshot().isLeader).toBe(true);
    only.close();
  });

  it('an ineligible tab never joins the queue, and can opt back in', async () => {
    const { locks, tab } = setup();
    const abstainer = tab({ eligible: false });
    await tick();

    expect(abstainer.getSnapshot().isLeader).toBe(false);
    expect(locks.isHeld('wl')).toBe(false); // it did not even queue

    abstainer.setEligible(true);
    await tick();
    expect(abstainer.getSnapshot().isLeader).toBe(true);

    abstainer.close();
  });

  it('withdrawing while holding the seat releases it to the next tab', async () => {
    const { tab } = setup();
    const holder = tab();
    const waiter = tab();
    await tick();
    expect(holder.getSnapshot().isLeader).toBe(true);

    holder.setEligible(false);
    await tick();

    expect(holder.getSnapshot().isLeader).toBe(false);
    expect(waiter.getSnapshot().isLeader).toBe(true);

    holder.close();
    waiter.close();
  });

  it('withdrawing while merely queued leaves the queue', async () => {
    const { locks, tab } = setup();
    const holder = tab();
    const waiter = tab();
    await tick();
    expect(locks.queued('wl')).toBe(1);

    waiter.setEligible(false);
    await tick();

    expect(locks.queued('wl')).toBe(0);
    holder.close();
    waiter.close();
  });

  it('a late joiner learns the incumbent without waiting for a heartbeat', async () => {
    const { tab } = setup();
    const incumbent = tab();
    await tick();

    const joiner = tab();
    await tick();

    // hello -> announce. There is no periodic beat to wait for here at all.
    expect(joiner.getSnapshot().leaderId).toBe(incumbent.clientId);
    expect(joiner.getSnapshot().isLeader).toBe(false);

    incumbent.close();
    joiner.close();
  });

  it('close is idempotent and stops the tab holding anything', async () => {
    const { locks, tab } = setup();
    const leader = tab();
    await tick();
    expect(locks.isHeld('wl')).toBe(true);

    leader.close();
    expect(() => leader.close()).not.toThrow();
    await tick();

    expect(locks.isHeld('wl')).toBe(false);
  });

  it('wakes subscribers when the seat moves, and stops after unsubscribing', async () => {
    const { tab } = setup();
    const holder = tab();
    const follower = tab();
    await tick();

    let calls = 0;
    const off = follower.subscribe(() => calls++);
    expect(calls).toBe(0);

    holder.resign(); // the seat moves to the follower
    await tick();
    expect(calls).toBeGreaterThan(0);
    expect(follower.getSnapshot().isLeader).toBe(true);

    const seen = calls;
    off();
    follower.resign();
    await tick();
    expect(calls).toBe(seen); // no longer listening

    holder.close();
    follower.close();
  });

  it('setEligible with the value it already has changes nothing', async () => {
    const { locks, tab } = setup();
    const leader = tab();
    await tick();

    leader.setEligible(true);
    await tick();

    expect(leader.getSnapshot().isLeader).toBe(true);
    expect(locks.isHeld('wl')).toBe(true);
    leader.close();
  });

  it('ignores a resign from a client that was not holding the seat', async () => {
    const { hub, tab } = setup();
    const leader = tab();
    const rogue = hub.connect();
    await tick();
    expect(leader.getSnapshot().isLeader).toBe(true);

    rogue.post({
      v: 1,
      scope: 'leader',
      type: 'resign',
      term: [9, 'nobody'],
      clientId: 'nobody',
      kind: 'tab',
    });
    await tick();

    // A stranger resigning a seat it never held must not vacate ours.
    expect(leader.getSnapshot().isLeader).toBe(true);
    leader.close();
    rogue.close();
  });

  it('announces itself with the kind it was given', async () => {
    const { hub, locks } = setup();
    const heard: string[] = [];
    const rogue = hub.connect();
    rogue.subscribe((data) => {
      const wire = data as { scope?: string; kind?: string };
      if (wire.scope === 'leader' && wire.kind) heard.push(wire.kind);
    });
    const leader = createLeader('wl', {
      transport: () => hub.connect(),
      locks,
      kind: 'worker',
    });
    await tick();

    expect(heard).toContain('worker');
    leader.close();
    rogue.close();
  });

  it('ignores a grant that arrives after the tab was closed', async () => {
    // Real Web Locks grants asynchronously, so a tab can be torn down between
    // the browser deciding it is next and our callback running. This lock
    // manager defers the grant to make that window reproducible.
    let grant: (() => void) | undefined;
    const deferred = {
      request: (_name: string, _options: { signal?: AbortSignal }, callback: () => Promise<void>) =>
        new Promise<void>((resolve) => {
          grant = () => void callback().then(resolve, resolve);
        }),
    };
    const hub = new MemoryHub();
    const leader = createLeader('wl-late', { transport: () => hub.connect(), locks: deferred });

    leader.close();
    grant?.(); // the browser hands it over to a tab that is already gone
    await tick();

    expect(leader.getSnapshot().isLeader).toBe(false);
  });
});

describe('detecting the platform lock manager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('picks up navigator.locks when the platform provides it', () => {
    // The auto path in a secure context. Everything else in this file injects a
    // manager, so without this the real detection branch is never exercised.
    const locks = new FakeLockManager();
    vi.stubGlobal('navigator', { locks });
    const hub = new MemoryHub();

    const leader = createLeader('wl-detect', { transport: () => hub.connect() });

    expect(leader.strategy).toBe('web-locks');
    leader.close();
  });

  it('ignores a navigator whose locks cannot grant anything', () => {
    // Some environments expose a stub. A `locks` without `request` is not a
    // lock manager, and treating it as one would break the election silently.
    vi.stubGlobal('navigator', { locks: {} });
    const hub = new MemoryHub();

    const leader = createLeader('wl-stub', { transport: () => hub.connect() });

    expect(leader.strategy).toBe('heartbeat');
    leader.close();
  });
});
