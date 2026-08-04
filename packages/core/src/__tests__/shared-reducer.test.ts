import { describe, expect, it } from 'vitest';
import { createSharedReducer } from '../shared-reducer.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

/**
 * The primitive exists for one failure, and it is the README's own example: two
 * tabs incrementing at the same moment agree on a number that is too small.
 * Last-writer-wins ships the *result* of the increment, so concurrent results
 * overwrite each other. A reducer ships the *increment*.
 */
type Action = { type: 'inc'; by: number } | { type: 'reset' };

const counter = (state: number, action: Action): number =>
  action.type === 'inc' ? state + action.by : 0;

/** Fake leadership, so ordering is tested without an election's timing. */
const fakeLeader = (isLeader: boolean) => ({
  clientId: 'fake',
  strategy: 'heartbeat' as const,
  getSnapshot: () => ({ leaderId: isLeader ? 'fake' : 'other', isLeader }),
  subscribe: () => () => {},
  waitForLeadership: () => Promise.resolve(),
  resign: () => {},
  setEligible: () => {},
  close: () => {},
});

const build = (hub: MemoryHub, isLeader: boolean, key = 'default') =>
  createSharedReducer<number, Action>('red', counter, 0, {
    transport: () => hub.connect(),
    leader: fakeLeader(isLeader),
    key,
  });

/** Leadership that can be handed over mid-test, which the fixed stub cannot. */
const promotableLeader = () => {
  let leading = false;
  return {
    clientId: 'fake',
    strategy: 'heartbeat' as const,
    getSnapshot: () => ({ leaderId: leading ? 'fake' : 'other', isLeader: leading }),
    subscribe: () => () => {},
    waitForLeadership: () => Promise.resolve(),
    resign: () => {},
    setEligible: () => {},
    close: () => {},
    promote: () => {
      leading = true;
    },
  };
};

describe('a shared reducer', () => {
  it('keeps both of two concurrent increments', async () => {
    const hub = new MemoryHub();
    const a = build(hub, true);
    const b = build(hub, false);
    await tick();

    // The exact race last-writer-wins loses: both read 0, both add 1.
    a.dispatch({ type: 'inc', by: 1 });
    b.dispatch({ type: 'inc', by: 1 });
    await tick();
    await tick();

    expect(a.getSnapshot()).toBe(2);
    expect(b.getSnapshot()).toBe(2);

    a.close();
    b.close();
  });

  it('is the case a store gets wrong, for comparison', async () => {
    const hub = new MemoryHub();
    const a = createSharedStore('red-lww', { n: 0 }, { transport: () => hub.connect() });
    const b = createSharedStore('red-lww', { n: 0 }, { transport: () => hub.connect() });
    await tick();

    a.set('n', (n) => n + 1);
    b.set('n', (n) => n + 1);
    await tick();

    // Pinned rather than lamented: this is correct last-writer-wins behaviour
    // and exactly why the reducer exists. If this ever reads 2, the register
    // semantics changed and the docs are wrong.
    expect(a.getSnapshot().n).toBe(1);
    expect(b.getSnapshot().n).toBe(1);

    a.close();
    b.close();
  });

  it('shows a follower its dispatch immediately, before it is committed', () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);

    follower.dispatch({ type: 'inc', by: 5 });

    // No await: typing must not wait for the leader to answer.
    expect(follower.getSnapshot()).toBe(5);
    expect(follower.pendingCount()).toBe(1);

    follower.close();
  });

  it('settles a follower once its dispatch comes back committed', async () => {
    const hub = new MemoryHub();
    const leader = build(hub, true);
    const follower = build(hub, false);
    await tick();

    follower.dispatch({ type: 'inc', by: 5 });
    for (let i = 0; i < 3; i++) await tick();

    expect(follower.pendingCount()).toBe(0);
    expect(follower.getSnapshot()).toBe(5);
    expect(leader.getSnapshot()).toBe(5);

    leader.close();
    follower.close();
  });

  it('commits the leader own dispatch without a round trip', () => {
    const hub = new MemoryHub();
    const leader = build(hub, true);

    leader.dispatch({ type: 'inc', by: 5 });

    // The sequencer is right here, so there is nothing to wait for and nothing
    // that could still be reordered.
    expect(leader.getSnapshot()).toBe(5);
    expect(leader.pendingCount()).toBe(0);

    leader.close();
  });

  it('applies every client in the same order, whoever dispatched', async () => {
    const hub = new MemoryHub();
    const a = build(hub, true);
    const b = build(hub, false);
    const c = build(hub, false);
    await tick();

    b.dispatch({ type: 'inc', by: 3 });
    c.dispatch({ type: 'inc', by: 4 });
    a.dispatch({ type: 'reset' });
    c.dispatch({ type: 'inc', by: 7 });
    for (let i = 0; i < 6; i++) await tick();

    // `reset` is not commutative, which is the point: an op-log that folded in
    // arbitrary order would let these three disagree.
    const settled = a.getSnapshot();
    expect(b.getSnapshot()).toBe(settled);
    expect(c.getSnapshot()).toBe(settled);

    a.close();
    b.close();
    c.close();
  });

  it('brings a late joiner up to the existing order', async () => {
    const hub = new MemoryHub();
    const a = build(hub, true);
    a.dispatch({ type: 'inc', by: 10 });
    for (let i = 0; i < 3; i++) await tick();

    const late = build(hub, false);
    for (let i = 0; i < 3; i++) await tick();

    expect(late.getSnapshot()).toBe(10);

    a.close();
    late.close();
  });

  it('keeps reducers on one bus independent', async () => {
    const hub = new MemoryHub();
    const votes = build(hub, true, 'votes');
    const clicks = build(hub, true, 'clicks');
    await tick();

    votes.dispatch({ type: 'inc', by: 1 });
    for (let i = 0; i < 3; i++) await tick();

    expect(votes.getSnapshot()).toBe(1);
    expect(clicks.getSnapshot()).toBe(0);

    votes.close();
    clicks.close();
  });

  it('does nothing with a dispatch after close', async () => {
    const hub = new MemoryHub();
    const a = build(hub, true);
    a.close();

    a.dispatch({ type: 'inc', by: 1 });
    await tick();

    expect(a.getSnapshot()).toBe(0);
  });

  it('notifies subscribers, and stops on unsubscribe', async () => {
    const hub = new MemoryHub();
    const a = build(hub, true);
    let calls = 0;
    const stop = a.subscribe(() => calls++);

    a.dispatch({ type: 'inc', by: 1 });
    expect(calls).toBe(1);

    stop();
    a.dispatch({ type: 'inc', by: 1 });
    expect(calls).toBe(1);

    a.close();
  });

  it('holds a commit that arrives out of order until the gap fills', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    const commit = (seq: number, by: number) =>
      wire.post({
        v: 1,
        scope: 'op',
        type: 'commit',
        key: 'default',
        action: { type: 'inc', by },
        opId: `op-${seq}`,
        seq,
        clientId: 'leader',
        kind: 'tab',
      });

    // 2 before 1: applying it now would fold the actions in the wrong order,
    // which for a non-commutative reducer is a permanent divergence.
    commit(2, 20);
    await tick();
    expect(follower.getSnapshot()).toBe(0);

    commit(1, 1);
    await tick();

    // Both applied, in commit order rather than arrival order.
    expect(follower.getSnapshot()).toBe(21);

    follower.close();
    wire.close();
  });

  it('adopts a snapshot when it has fallen behind', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    wire.post({
      v: 1,
      scope: 'op',
      type: 'snapshot',
      key: 'default',
      state: 99,
      seq: 12,
      clientId: 'leader',
      kind: 'tab',
    });
    await tick();

    expect(follower.getSnapshot()).toBe(99);

    // And carries on from the snapshot's number, not from zero.
    wire.post({
      v: 1,
      scope: 'op',
      type: 'commit',
      key: 'default',
      action: { type: 'inc', by: 1 },
      opId: 'op-13',
      seq: 13,
      clientId: 'leader',
      kind: 'tab',
    });
    await tick();
    expect(follower.getSnapshot()).toBe(100);

    follower.close();
    wire.close();
  });

  it('ignores a snapshot that is older than what it has', async () => {
    const hub = new MemoryHub();
    const leader = build(hub, true);
    leader.dispatch({ type: 'inc', by: 7 });
    const wire = hub.connect();
    await tick();

    wire.post({
      v: 1,
      scope: 'op',
      type: 'snapshot',
      key: 'default',
      state: 0,
      seq: 0,
      clientId: 'stale',
      kind: 'tab',
    });
    await tick();

    expect(leader.getSnapshot()).toBe(7);

    leader.close();
    wire.close();
  });

  it('applies a repeated commit number once', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    const commit = () =>
      wire.post({
        v: 1,
        scope: 'op',
        type: 'commit',
        key: 'default',
        action: { type: 'inc', by: 5 },
        opId: 'op-1',
        seq: 1,
        clientId: 'leader',
        kind: 'tab',
      });

    commit();
    await tick();
    // Two tabs both believing they hold the seat is the case this covers: the
    // second commit at a number already applied is dropped, not folded again.
    commit();
    await tick();

    expect(follower.getSnapshot()).toBe(5);

    follower.close();
    wire.close();
  });

  it('ignores an op type it does not know', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    // Additive evolution within a wire version: a build that has never heard of
    // a type must treat it as nothing. See wire.ts.
    wire.post({
      v: 1,
      scope: 'op',
      type: 'rollback',
      key: 'default',
      clientId: 'later-build',
      kind: 'tab',
    } as never);
    await tick();

    expect(follower.getSnapshot()).toBe(0);
    follower.dispatch({ type: 'inc', by: 1 });
    expect(follower.getSnapshot()).toBe(1);

    follower.close();
    wire.close();
  });

  it('drops buffered commits a snapshot has already folded in, and replays the rest', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    const commit = (seq: number, by: number) =>
      wire.post({
        v: 1,
        scope: 'op',
        type: 'commit',
        key: 'default',
        action: { type: 'inc', by },
        opId: `op-${seq}`,
        seq,
        clientId: 'leader',
        kind: 'tab',
      });

    // Buffered, because 1 never arrived.
    commit(2, 20);
    commit(4, 400);
    await tick();
    expect(follower.getSnapshot()).toBe(0);

    // A snapshot at 3 supersedes the buffered 2 and unblocks the buffered 4.
    wire.post({
      v: 1,
      scope: 'op',
      type: 'snapshot',
      key: 'default',
      state: 300,
      seq: 3,
      clientId: 'leader',
      kind: 'tab',
    });
    await tick();

    expect(follower.getSnapshot()).toBe(700);

    follower.close();
    wire.close();
  });

  it('elects its own leader when it is not handed one', async () => {
    const hub = new MemoryHub();
    const solo = createSharedReducer<number, Action>('red-solo', counter, 0, {
      transport: () => hub.connect(),
      leaderOptions: { strategy: 'heartbeat', heartbeatMs: 10, leaseMs: 30 },
    });
    // Alone on the bus, so the seat is its own once the lease settles.
    await new Promise((r) => setTimeout(r, 60));

    solo.dispatch({ type: 'inc', by: 3 });
    for (let i = 0; i < 3; i++) await tick();

    expect(solo.getSnapshot()).toBe(3);
    // Closing must take the leader with it — the reducer built it.
    solo.close();
    solo.close(); // idempotent
  });

  it('numbers from the order it observed when it inherits the seat', async () => {
    const hub = new MemoryHub();
    const leader = promotableLeader();
    const heir = createSharedReducer<number, Action>('red-handover', counter, 0, {
      transport: () => hub.connect(),
      leader,
    });
    const wire = hub.connect();
    const issued: number[] = [];
    wire.subscribe((data) => {
      const w = data as { scope?: string; type?: string; seq?: number };
      if (w.scope === 'op' && w.type === 'commit') issued.push(w.seq as number);
    });

    // Three commits from the outgoing leader, observed but not issued here.
    for (let seq = 1; seq <= 3; seq++) {
      wire.post({
        v: 1,
        scope: 'op',
        type: 'commit',
        key: 'default',
        action: { type: 'inc', by: 1 },
        opId: `op-${seq}`,
        seq,
        clientId: 'old-leader',
        kind: 'tab',
      });
    }
    await tick();
    expect(heir.getSnapshot()).toBe(3);

    leader.promote();
    heir.dispatch({ type: 'inc', by: 1 });
    await tick();

    // 4, not 1. A tab that has just inherited the seat has issued nothing, so
    // numbering from what it issued would reuse numbers every peer has already
    // applied — and a reused number is silently dropped as a duplicate.
    expect(issued).toEqual([4]);

    heir.close();
    wire.close();
  });

  it('settles only the dispatch that was committed, leaving the others pending', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    follower.dispatch({ type: 'inc', by: 1 });
    follower.dispatch({ type: 'inc', by: 2 });
    follower.dispatch({ type: 'inc', by: 4 });
    expect(follower.pendingCount()).toBe(3);

    // Commit the middle one only. Matching on opId is what makes this precise;
    // clearing the whole queue instead would look identical from the snapshot.
    const proposals = [] as string[];
    wire.subscribe((data) => {
      const w = data as { scope?: string; type?: string; opId?: string };
      if (w.scope === 'op' && w.type === 'propose') proposals.push(w.opId as string);
    });
    follower.dispatch({ type: 'inc', by: 8 });
    await tick();

    wire.post({
      v: 1,
      scope: 'op',
      type: 'commit',
      key: 'default',
      action: { type: 'inc', by: 8 },
      opId: proposals[proposals.length - 1],
      seq: 1,
      clientId: 'leader',
      kind: 'tab',
    } as never);
    await tick();

    expect(follower.pendingCount()).toBe(3);
    expect(follower.getSnapshot()).toBe(15);

    follower.close();
    wire.close();
  });

  it('unblocks a whole run of buffered commits, in order', async () => {
    const hub = new MemoryHub();
    const follower = build(hub, false);
    const wire = hub.connect();
    await tick();

    const commit = (seq: number, by: number) =>
      wire.post({
        v: 1,
        scope: 'op',
        type: 'commit',
        key: 'default',
        action: { type: 'inc', by },
        opId: `op-${seq}`,
        seq,
        clientId: 'leader',
        kind: 'tab',
      } as never);

    // 4, 3, 2 buffered; 1 releases all of them. A run, not a single gap: the
    // chain is what an off-by-one in the unblock step would break.
    commit(4, 1000);
    commit(3, 100);
    commit(2, 10);
    await tick();
    expect(follower.getSnapshot()).toBe(0);

    commit(1, 1);
    await tick();

    expect(follower.getSnapshot()).toBe(1111);

    follower.close();
    wire.close();
  });

  it('ignores op traffic meant for another reducer on the same bus', async () => {
    const hub = new MemoryHub();
    const mine = build(hub, false, 'mine');
    const wire = hub.connect();
    await tick();

    wire.post({
      v: 1,
      scope: 'op',
      type: 'commit',
      key: 'theirs',
      action: { type: 'inc', by: 5 },
      opId: 'op-1',
      seq: 1,
      clientId: 'leader',
      kind: 'tab',
    } as never);
    await tick();

    expect(mine.getSnapshot()).toBe(0);

    mine.close();
    wire.close();
  });

  it('says nothing to a hello when it has no order to share', async () => {
    const hub = new MemoryHub();
    const fresh = build(hub, false);
    const wire = hub.connect();
    const replies: unknown[] = [];
    wire.subscribe((data) => {
      const w = data as { scope?: string; type?: string };
      if (w.scope === 'op' && w.type === 'snapshot') replies.push(w);
    });
    await tick();

    wire.post({
      v: 1,
      scope: 'op',
      type: 'hello',
      key: 'default',
      clientId: 'joiner',
      kind: 'tab',
    } as never);
    await tick();

    // Nothing committed here yet, so there is no order to hand anybody.
    expect(replies).toEqual([]);

    fresh.close();
    wire.close();
  });

  it('closes a leader it built, and leaves one it was handed alone', async () => {
    const hub = new MemoryHub();
    let closed = false;
    const borrowed = { ...fakeLeader(true), close: () => (closed = true) };

    const withBorrowed = createSharedReducer<number, Action>('red-borrow', counter, 0, {
      transport: () => hub.connect(),
      leader: borrowed,
    });
    withBorrowed.close();
    // A leader passed in belongs to the caller — closing it would take down
    // whatever else on the page shares that seat.
    expect(closed).toBe(false);

    const own = createSharedReducer<number, Action>('red-own', counter, 0, {
      transport: () => hub.connect(),
      leaderOptions: { strategy: 'heartbeat', heartbeatMs: 10, leaseMs: 30 },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(own.getSnapshot()).toBe(0);
    own.close();
  });

  it('does not notify when the value is unchanged', () => {
    const hub = new MemoryHub();
    const a = createSharedReducer<number, Action>('red-same', (s) => s, 0, {
      transport: () => hub.connect(),
      leader: fakeLeader(true),
    });
    let calls = 0;
    a.subscribe(() => calls++);

    a.dispatch({ type: 'inc', by: 1 });

    // A reducer that returns its input has changed nothing, and a snapshot that
    // is identical must not wake useSyncExternalStore.
    expect(calls).toBe(0);
    a.close();
  });
});
