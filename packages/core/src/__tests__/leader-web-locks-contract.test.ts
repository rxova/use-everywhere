// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { isVersion } from '../clock.js';
import { createLeader } from '../leader.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { FakeLockManager } from './helpers/fake-locks.js';
import { tick } from './helpers/tick.js';

/**
 * The Web Locks strategy, which the existing suite exercises through its happy
 * path. These are the branches the mutation run showed nothing was checking:
 * what it puts on the wire, what it does with wires it should ignore, and how
 * it lets go of the lock.
 */
let n = 0;
const uniqueName = () => `wl-${++n}`;

const settle = () => new Promise<void>((r) => setTimeout(r, 5));

const recorder = (hub: MemoryHub) => {
  const seen: BusWire[] = [];
  const wire = hub.connect();
  wire.subscribe((data) => seen.push(data as BusWire));
  return { seen, close: () => wire.close() };
};

const build = (hub: MemoryHub, locks: FakeLockManager, name: string, extra = {}) =>
  createLeader(name, {
    strategy: 'web-locks',
    locks,
    transport: () => hub.connect(),
    ...extra,
  });

describe('what the Web Locks strategy puts on the wire', () => {
  it('announces when it takes the lock', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const leader = build(hub, new FakeLockManager(), uniqueName());
    await settle();

    // No claim and no heartbeat interval: holding the lock *is* the claim, and
    // one announcement is what tells peers who has it.
    const announces = rec.seen.filter((w) => w.scope === 'leader' && w.type === 'heartbeat');
    expect(announces.length).toBeGreaterThanOrEqual(1);
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.close();
    rec.close();
  });

  it('answers a joiner hello, but only while it holds the seat', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const leader = build(hub, locks, name);
    await settle();
    const rec = recorder(hub);

    hub.connect().post({
      v: 1,
      scope: 'leader',
      type: 'hello',
      clientId: 'joiner',
      kind: 'tab',
    } satisfies BusWire);
    await tick();
    expect(rec.seen.filter((w) => w.type === 'heartbeat')).toHaveLength(1);

    // Once it has given the seat up, a hello is not its to answer.
    leader.setEligible(false);
    await settle();
    // Counting heartbeats, not every wire: the recorder is a hub connection, so
    // it also sees the hello being injected below.
    const answered = rec.seen.filter((w) => w.type === 'heartbeat').length;
    hub.connect().post({
      v: 1,
      scope: 'leader',
      type: 'hello',
      clientId: 'joiner',
      kind: 'tab',
    } satisfies BusWire);
    await tick();
    expect(rec.seen.filter((w) => w.type === 'heartbeat')).toHaveLength(answered);

    leader.close();
    rec.close();
  });

  it('says resign when it gives the seat up', async () => {
    const hub = new MemoryHub();
    const leader = build(hub, new FakeLockManager(), uniqueName());
    await settle();
    const rec = recorder(hub);

    leader.setEligible(false);
    await settle();

    expect(rec.seen.filter((w) => w.type === 'resign')).toHaveLength(1);

    leader.close();
    rec.close();
  });

  it('passes an explicit kind through to the bus', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const leader = build(hub, new FakeLockManager(), uniqueName(), { kind: 'worker' });
    await settle();

    expect(rec.seen.some((w) => w.kind === 'worker')).toBe(true);

    leader.close();
    rec.close();
  });
});

describe('wires it hears from others', () => {
  it('follows whoever announces, since only the lock holder can', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    // Holds the lock, so this one is a follower.
    const incumbent = build(hub, locks, name);
    await settle();
    const follower = build(hub, locks, name);
    await settle();

    expect(follower.getSnapshot().leaderId).toBe(incumbent.clientId);
    expect(follower.getSnapshot().isLeader).toBe(false);

    incumbent.close();
    follower.close();
  });

  it('empties the seat on a resign from the holder, and ignores one from anyone else', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const incumbent = build(hub, locks, name);
    await settle();
    const follower = build(hub, locks, name);
    await settle();
    expect(follower.getSnapshot().leaderId).toBe(incumbent.clientId);

    const wire = hub.connect();
    wire.post({
      v: 1,
      scope: 'leader',
      type: 'resign',
      term: [1, 'stranger'],
      clientId: 'stranger',
      kind: 'tab',
    } satisfies BusWire);
    await tick();
    // A stranger cannot vacate somebody else's seat by saying so.
    expect(follower.getSnapshot().leaderId).toBe(incumbent.clientId);

    wire.post({
      v: 1,
      scope: 'leader',
      type: 'resign',
      term: [1, incumbent.clientId],
      clientId: incumbent.clientId,
      kind: 'tab',
    } satisfies BusWire);
    await tick();
    expect(follower.getSnapshot().leaderId).toBeNull();

    incumbent.close();
    follower.close();
    wire.close();
  });

  it('ignores traffic on other scopes', async () => {
    const hub = new MemoryHub();
    const leader = build(hub, new FakeLockManager(), uniqueName());
    await settle();
    let changes = 0;
    leader.subscribe(() => changes++);

    hub.connect().post({
      v: 1,
      scope: 'presence',
      type: 'hello',
      clientId: 'x',
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    expect(changes).toBe(0);
    leader.close();
  });
});

describe('letting go of the lock', () => {
  it('hands it to the next in the queue when it becomes ineligible', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const first = build(hub, locks, name);
    await settle();
    const second = build(hub, locks, name);
    await settle();
    expect(first.getSnapshot().isLeader).toBe(true);

    first.setEligible(false);
    await settle();

    expect(second.getSnapshot().isLeader).toBe(true);

    first.close();
    second.close();
  });

  it('does nothing when eligibility is set to what it already is', async () => {
    const hub = new MemoryHub();
    const leader = build(hub, new FakeLockManager(), uniqueName());
    await settle();
    let changes = 0;
    leader.subscribe(() => changes++);

    leader.setEligible(true);
    await settle();

    expect(changes).toBe(0);
    leader.close();
  });

  it('rejoins the queue when it becomes eligible again', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const leader = build(hub, locks, name);
    await settle();

    leader.setEligible(false);
    await settle();
    expect(leader.getSnapshot().isLeader).toBe(false);

    leader.setEligible(true);
    await settle();
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.close();
  });

  it('gives the seat up on pagehide', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const leader = build(hub, locks, name);
    await settle();
    const rec = recorder(hub);

    dispatchEvent(new Event('pagehide'));
    await settle();

    expect(rec.seen.filter((w) => w.type === 'resign')).toHaveLength(1);

    leader.close();
    rec.close();
  });

  it('releases on close, is idempotent, and stops listening', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const leader = build(hub, locks, name);
    await settle();

    leader.close();
    leader.close();
    await settle();

    const rec = recorder(hub);
    dispatchEvent(new Event('pagehide'));
    await settle();

    // A closed leader that still answered pagehide would post on a released bus.
    expect(rec.seen).toHaveLength(0);
    rec.close();
  });

  it('lets a queued follower through once the holder closes', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    const waiting = build(hub, locks, name);
    await settle();
    expect(waiting.getSnapshot().isLeader).toBe(false);

    holder.close();
    await settle();

    expect(waiting.getSnapshot().isLeader).toBe(true);
    waiting.close();
  });
});

describe('the snapshot it hands subscribers', () => {
  it('wakes nobody when a repeated announcement names the same leader', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    const follower = build(hub, locks, name);
    await settle();
    let changes = 0;
    follower.subscribe(() => changes++);

    const wire = hub.connect();
    for (let i = 0; i < 3; i++) {
      wire.post({
        v: 1,
        scope: 'leader',
        type: 'heartbeat',
        term: [1, holder.clientId],
        clientId: holder.clientId,
        kind: 'tab',
      } satisfies BusWire);
    }
    await tick();

    // The leader has not changed, so nothing has. Minting a new snapshot per
    // announcement would spin useSyncExternalStore forever.
    expect(changes).toBe(0);

    holder.close();
    follower.close();
    wire.close();
  });

  it('does not resolve waitForLeadership when somebody else takes the seat', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    const waiting = build(hub, locks, name);
    await settle();

    const settled = vi.fn();
    void waiting.waitForLeadership().then(settled, settled);
    await settle();

    // The seat is taken, and by somebody else. A waiter that resolved here
    // would run leader-only work in a tab that is not the leader.
    expect(settled).not.toHaveBeenCalled();
    expect(waiting.getSnapshot().leaderId).toBe(holder.clientId);

    holder.close();
    waiting.close();
  });

  it('announces a term other strategies can arbitrate', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const leader = build(hub, new FakeLockManager(), uniqueName());
    await settle();

    const announce = rec.seen.find((w) => w.scope === 'leader' && w.type === 'heartbeat');
    // The lock decides here, but the wire is shared with the heartbeat
    // strategy, and a peer on that one arbitrates whatever term arrives.
    expect(announce && 'term' in announce && isVersion(announce.term)).toBe(true);

    leader.close();
    rec.close();
  });
});

describe('who is allowed to say the seat is empty', () => {
  it('does not resolve a waiter when the seat merely empties', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    // Ineligible, so it can never take the seat itself and its waiter can only
    // be resolved — wrongly — by somebody else's transition.
    const bystander = build(hub, locks, name, { eligible: false });
    await settle();

    const settled = vi.fn();
    void bystander.waitForLeadership().then(settled, settled);

    const wire = hub.connect();
    wire.post({
      v: 1,
      scope: 'leader',
      type: 'resign',
      term: [1, holder.clientId],
      clientId: holder.clientId,
      kind: 'tab',
    } satisfies BusWire);
    await settle();

    // The seat is empty now, which is not the same as being ours.
    expect(bystander.getSnapshot().leaderId).toBeNull();
    expect(settled).not.toHaveBeenCalled();

    holder.close();
    bystander.close();
    wire.close();
  });

  it('says nothing on the wire when a follower closes', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    const follower = build(hub, locks, name);
    await settle();
    const rec = recorder(hub);

    follower.close();
    await settle();

    // A follower announcing a resign would tell every peer the leader had gone
    // — and the leader is sitting right there, still holding the lock.
    expect(rec.seen.filter((w) => w.type === 'resign')).toHaveLength(0);
    expect(holder.getSnapshot().isLeader).toBe(true);

    holder.close();
    rec.close();
  });

  it('tells peers when the holder gives the seat up', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    // Ineligible so it never takes the seat, leaving the wire as the only way
    // it could learn the seat was vacated.
    const observer = build(hub, locks, name, { eligible: false });
    await settle();
    expect(observer.getSnapshot().leaderId).toBe(holder.clientId);

    holder.close();
    await settle();

    expect(observer.getSnapshot().leaderId).toBeNull();

    observer.close();
  });
});

describe('joining the queue', () => {
  it('does not queue twice while a request is already outstanding', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    const waiting = build(hub, locks, name);
    await settle();

    // Already waiting. Toggling eligibility on — which it already is — must not
    // enqueue a second request, or the lock is held twice over and the second
    // grant never resolves.
    waiting.setEligible(true);
    await settle();
    expect(locks.queued(`use-everywhere:leader:${name}`)).toBeLessThanOrEqual(1);

    holder.close();
    await settle();
    expect(waiting.getSnapshot().isLeader).toBe(true);

    waiting.close();
  });

  it('does not queue at all when it is ineligible from the start', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const standby = build(hub, locks, name, { eligible: false });
    await settle();

    expect(standby.getSnapshot().isLeader).toBe(false);
    expect(locks.isHeld(`use-everywhere:leader:${name}`)).toBe(false);

    standby.close();
  });

  it('stops caring about the seat once closed, even mid-queue', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const holder = build(hub, locks, name);
    await settle();
    const waiting = build(hub, locks, name);
    await settle();

    waiting.close();
    holder.close();
    await settle();

    // A closed follower must not quietly take the seat it was queued for.
    expect(waiting.getSnapshot().isLeader).toBe(false);
  });
});

describe('resign', () => {
  it('hands the seat on when somebody else is waiting', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const name = uniqueName();
    const first = build(hub, locks, name);
    await settle();
    const second = build(hub, locks, name);
    await settle();

    first.resign();
    await settle();

    expect(second.getSnapshot().isLeader).toBe(true);

    first.close();
    second.close();
  });

  it('hands it straight back when nobody else is waiting', async () => {
    const hub = new MemoryHub();
    const leader = build(hub, new FakeLockManager(), uniqueName());
    await settle();

    leader.resign();
    await settle();

    // Documented behaviour, not a bug: re-queuing finds nobody else, so the
    // seat comes home. `resign` moves the seat when there is somewhere to move.
    expect(leader.getSnapshot().isLeader).toBe(true);
    leader.close();
  });
});
