// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { createLeader } from '../leader.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

/**
 * Heartbeat-election behaviour nothing was checking, found by the mutation run:
 * the wires it emits, what it does with a claim it should ignore, and the
 * lifecycle listeners it attaches.
 */
let n = 0;
const uniqueName = () => `lc-${++n}`;
const FAST = { strategy: 'heartbeat' as const, heartbeatMs: 20, leaseMs: 60 };

const recorder = (hub: MemoryHub) => {
  const seen: BusWire[] = [];
  const wire = hub.connect();
  wire.subscribe((data) => seen.push(data as BusWire));
  return { seen, close: () => wire.close() };
};

const leaderWires = (seen: BusWire[], type: string) =>
  seen.filter((w) => w.scope === 'leader' && w.type === type);

describe('what the heartbeat election puts on the wire', () => {
  it('claims the seat when nobody holds it, then heartbeats', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });

    await new Promise((r) => setTimeout(r, 120));

    expect(leaderWires(rec.seen, 'claim').length).toBeGreaterThanOrEqual(1);
    expect(leaderWires(rec.seen, 'heartbeat').length).toBeGreaterThanOrEqual(1);
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.close();
    rec.close();
  });

  it('resigns on the wire, so peers take over without waiting out the lease', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    const rec = recorder(hub);

    leader.resign();
    await tick();

    expect(leaderWires(rec.seen, 'resign')).toHaveLength(1);

    leader.close();
    rec.close();
  });

  it('answers a newcomer hello so it learns the seat is taken', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    const rec = recorder(hub);

    hub.connect().post({
      v: 1,
      scope: 'leader',
      type: 'hello',
      clientId: 'newcomer',
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    // Silence would make the newcomer wait out a whole lease before claiming a
    // seat that is already held, and then fight for it.
    expect(leaderWires(rec.seen, 'heartbeat').length).toBeGreaterThanOrEqual(1);

    leader.close();
    rec.close();
  });
});

describe('claims it should ignore', () => {
  it('ignores a claim whose term is not a version', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));

    hub.connect().post({
      v: 1,
      scope: 'leader',
      type: 'claim',
      term: 'nonsense',
      clientId: 'impostor',
      kind: 'tab',
    } as unknown as BusWire);
    await tick();

    expect(leader.getSnapshot().leaderId).toBe(leader.clientId);

    leader.close();
  });

  it('ignores a resign from a client that does not hold the seat', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    expect(leader.getSnapshot().isLeader).toBe(true);

    hub.connect().post({
      v: 1,
      scope: 'leader',
      type: 'resign',
      term: [1, 'nobody'],
      clientId: 'nobody',
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    // A resign from a non-leader must not vacate the seat, or any peer could
    // depose the leader by saying so.
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.close();
  });

  it('ignores traffic on other scopes entirely', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    let changes = 0;
    leader.subscribe(() => changes++);

    hub.connect().post({
      v: 1,
      scope: 'state',
      type: 'patch',
      key: 'k',
      value: 1,
      version: [1, 'x'],
      clientId: 'x',
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    expect(changes).toBe(0);
    leader.close();
  });
});

describe('eligibility', () => {
  it('does nothing when set to what it already is', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    let changes = 0;
    leader.subscribe(() => changes++);

    leader.setEligible(true);
    await tick();

    expect(changes).toBe(0);
    leader.close();
  });

  it('gives up the seat when it becomes ineligible, and can take it back', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.setEligible(false);
    await tick();
    expect(leader.getSnapshot().isLeader).toBe(false);

    leader.setEligible(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.close();
  });
});

describe('lifecycle', () => {
  it('gives up the seat on pagehide rather than holding it while gone', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    const before = leaderWires(rec.seen, 'resign').length;

    dispatchEvent(new Event('pagehide'));
    await tick();

    expect(leaderWires(rec.seen, 'resign').length).toBeGreaterThan(before);

    leader.close();
    rec.close();
  });

  it('rejoins the election on a bfcache restore, and not on an ordinary pageshow', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    const rec = recorder(hub);

    const ordinary = new Event('pageshow') as Event & { persisted?: boolean };
    ordinary.persisted = false;
    dispatchEvent(ordinary);
    await tick();
    const afterOrdinary = rec.seen.length;

    const restored = new Event('pageshow') as Event & { persisted?: boolean };
    restored.persisted = true;
    dispatchEvent(restored);
    await tick();

    expect(rec.seen.length).toBeGreaterThan(afterOrdinary);

    leader.close();
    rec.close();
  });

  it('stops answering lifecycle events once closed', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    await new Promise((r) => setTimeout(r, 100));
    leader.close();
    leader.close(); // idempotent
    const rec = recorder(hub);

    dispatchEvent(new Event('pagehide'));
    const restored = new Event('pageshow') as Event & { persisted?: boolean };
    restored.persisted = true;
    dispatchEvent(restored);
    await tick();

    expect(rec.seen).toHaveLength(0);
    rec.close();
  });
});

describe('strategy selection', () => {
  it('throws when web-locks is demanded and unavailable, rather than degrading', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    try {
      expect(() => createLeader(uniqueName(), { strategy: 'web-locks' })).toThrow(/web-locks/);
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
    }
  });

  it('resolves the default to a concrete strategy, never auto', () => {
    const hub = new MemoryHub();
    // No strategy passed: 'auto' is a request, not an answer, and reporting it
    // back would tell a bug report nothing about what actually arbitrated.
    const leader = createLeader(uniqueName(), { transport: () => hub.connect() });

    expect(['heartbeat', 'web-locks']).toContain(leader.strategy);
    leader.close();
  });

  it('reports the strategy it actually ended up on', () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });

    expect(leader.strategy).toBe('heartbeat');
    leader.close();
  });

  it('passes an explicit kind through to the bus', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const leader = createLeader(uniqueName(), {
      ...FAST,
      kind: 'worker',
      transport: () => hub.connect(),
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(rec.seen.some((w) => w.kind === 'worker')).toBe(true);

    leader.close();
    rec.close();
  });
});

describe('waitForLeadership', () => {
  it('resolves once the seat is held', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });

    await expect(leader.waitForLeadership()).resolves.toBeUndefined();
    leader.close();
  });

  it('rejects when the leader is closed while still waiting', async () => {
    const hub = new MemoryHub();
    const leader = createLeader(uniqueName(), {
      ...FAST,
      eligible: false,
      transport: () => hub.connect(),
    });
    const pending = leader.waitForLeadership();
    const assertion = expect(pending).rejects.toThrow();

    leader.close();
    await assertion;
  });
});

describe('a peer that holds the seat', () => {
  it('is followed rather than fought', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const follower = createLeader(uniqueName(), { ...FAST, transport: () => hub.connect() });
    const wire = hub.connect();

    // An incumbent already heartbeating: the follower must adopt it rather than
    // wait out the lease and claim.
    wire.post({
      v: 1,
      scope: 'leader',
      type: 'heartbeat',
      term: [1, 'incumbent'],
      clientId: 'incumbent',
      kind: 'tab',
    } satisfies BusWire);
    await vi.advanceTimersByTimeAsync(10);

    expect(follower.getSnapshot().leaderId).toBe('incumbent');
    expect(follower.getSnapshot().isLeader).toBe(false);

    follower.close();
    wire.close();
    vi.useRealTimers();
  });
});
