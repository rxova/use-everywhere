import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { createLeader } from '../leader.js';
import type { LeaderOptions } from '../leader.types.js';
import { MemoryHub } from '../transport/memory-hub.js';

const HEARTBEAT = 1000;
const LEASE = 3000;

describe('createLeader', () => {
  let hub: MemoryHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  // One createLeader call with a custom transport = one simulated tab: getBus
  // bypasses the registry whenever a transport factory is given.
  const tab = (name: string, options: LeaderOptions = {}) =>
    createLeader(name, { transport: () => hub.connect(), ...options });

  it('leads on its own after one heartbeat, not a whole lease', async () => {
    const a = tab('lone');
    expect(a.getSnapshot()).toEqual({ leaderId: null, isLeader: false });

    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    expect(a.getSnapshot()).toEqual({ leaderId: a.clientId, isLeader: true });
    a.close();
  });

  it('a joiner adopts the incumbent instead of stealing the seat', async () => {
    const a = tab('sticky');
    await vi.advanceTimersByTimeAsync(HEARTBEAT);
    expect(a.getSnapshot().isLeader).toBe(true);

    const b = tab('sticky');
    // The incumbent answers the joiner's hello at once, so no lease elapses.
    await vi.advanceTimersByTimeAsync(0);

    expect(b.getSnapshot()).toEqual({ leaderId: a.clientId, isLeader: false });
    expect(a.getSnapshot().isLeader).toBe(true);

    // And it stays put as time passes.
    await vi.advanceTimersByTimeAsync(LEASE * 2);
    expect(a.getSnapshot().isLeader).toBe(true);
    expect(b.getSnapshot().leaderId).toBe(a.clientId);

    a.close();
    b.close();
  });

  it('the joiner sees exactly one transition — no leaderless flash, no churn', async () => {
    const a = tab('churn');
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    const b = tab('churn');
    const seen: Array<string | null> = [];
    b.subscribe(() => seen.push(b.getSnapshot().leaderId));

    await vi.advanceTimersByTimeAsync(LEASE * 2);

    expect(seen).toEqual([a.clientId]);

    a.close();
    b.close();
  });

  it('keeps the snapshot referentially stable across heartbeats', async () => {
    const a = tab('stable');
    await vi.advanceTimersByTimeAsync(HEARTBEAT);
    const first = a.getSnapshot();

    // Many heartbeats confirming the same leader must mint no new object,
    // or useSyncExternalStore would re-render forever.
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 5);

    expect(a.getSnapshot()).toBe(first);
    a.close();
  });

  it('two tabs starting together converge on exactly one leader', async () => {
    const a = tab('race');
    const b = tab('race');

    await vi.advanceTimersByTimeAsync(HEARTBEAT * 3);

    const leaderId = a.getSnapshot().leaderId;
    expect(leaderId).not.toBeNull();
    expect(b.getSnapshot().leaderId).toBe(leaderId);
    // Exactly one seat, never two.
    expect([a, b].filter((t) => t.getSnapshot().isLeader)).toHaveLength(1);

    // And it holds — no flapping once settled.
    await vi.advanceTimersByTimeAsync(LEASE * 2);
    expect(a.getSnapshot().leaderId).toBe(leaderId);
    expect(b.getSnapshot().leaderId).toBe(leaderId);

    a.close();
    b.close();
  });

  it('breaks a genuinely crossing claim by clientId', async () => {
    // Claims only cross when neither client has heard the other yet. Post one
    // by hand at the incumbent's own counter, with a clientId that beats it:
    // newer() must hand over the seat.
    const incumbent = tab('tiebreak');
    const rogue = hub.connect();
    await vi.advanceTimersByTimeAsync(HEARTBEAT);
    expect(incumbent.getSnapshot().isLeader).toBe(true);

    rogue.post({
      v: 1,
      scope: 'leader',
      type: 'claim',
      term: [1, 'zzz-rogue'], // same counter as the incumbent's [1, clientId]
      clientId: 'zzz-rogue',
      kind: 'tab',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(incumbent.getSnapshot()).toEqual({ leaderId: 'zzz-rogue', isLeader: false });

    incumbent.close();
    rogue.close();
  });

  it('hands the seat to a survivor when the leader closes', async () => {
    const a = tab('closing');
    const b = tab('closing');
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 3);

    const leader = a.getSnapshot().isLeader ? a : b;
    const follower = leader === a ? b : a;

    // close() resigns on the way out, so this is the fast path, not the lease.
    leader.close();
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    expect(follower.getSnapshot()).toEqual({
      leaderId: follower.clientId,
      isLeader: true,
    });

    follower.close();
  });

  it('fails over on the lease when a leader crashes without resigning', async () => {
    const name = 'silent';
    // A raw peer that claims the seat and then never speaks again.
    const ghost = hub.connect();
    const survivor = tab(name);

    const claim: BusWire = {
      v: 1,
      scope: 'leader',
      type: 'claim',
      term: [9, 'zzz-ghost'],
      clientId: 'zzz-ghost',
      kind: 'tab',
    };
    ghost.post(claim);
    await vi.advanceTimersByTimeAsync(0);

    expect(survivor.getSnapshot().leaderId).toBe('zzz-ghost');

    // Silence past the lease: the survivor takes over with a strictly higher term.
    await vi.advanceTimersByTimeAsync(LEASE + HEARTBEAT);

    expect(survivor.getSnapshot().isLeader).toBe(true);

    survivor.close();
    ghost.close();
  });

  it('hands over instantly on resign, and the resigner does not reclaim', async () => {
    const a = tab('resign');
    const b = tab('resign');
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 3);

    const leader = a.getSnapshot().isLeader ? a : b;
    const other = leader === a ? b : a;

    leader.resign();
    // Instant: receivers re-arm the lease at 0, so this is one macrotask,
    // far short of the 3s lease.
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    expect(other.getSnapshot()).toEqual({ leaderId: other.clientId, isLeader: true });
    expect(leader.getSnapshot().isLeader).toBe(false);

    a.close();
    b.close();
  });

  it('an ineligible client never claims, and the seat stays empty', async () => {
    const a = tab('ineligible', { eligible: false });
    const b = tab('ineligible', { eligible: false });

    await vi.advanceTimersByTimeAsync(LEASE * 3);

    expect(a.getSnapshot()).toEqual({ leaderId: null, isLeader: false });
    expect(b.getSnapshot()).toEqual({ leaderId: null, isLeader: false });

    a.close();
    b.close();
  });

  it('an ineligible client still follows an eligible leader', async () => {
    const leader = tab('mixed');
    const bystander = tab('mixed', { eligible: false });

    await vi.advanceTimersByTimeAsync(HEARTBEAT * 2);

    expect(leader.getSnapshot().isLeader).toBe(true);
    expect(bystander.getSnapshot()).toEqual({
      leaderId: leader.clientId,
      isLeader: false,
    });

    leader.close();
    bystander.close();
  });

  it('setEligible(true) lets a standby take an empty seat', async () => {
    const a = tab('enable', { eligible: false });
    await vi.advanceTimersByTimeAsync(LEASE * 2);
    expect(a.getSnapshot().leaderId).toBeNull();

    a.setEligible(true);
    await vi.advanceTimersByTimeAsync(LEASE + HEARTBEAT);

    expect(a.getSnapshot().isLeader).toBe(true);
    a.close();
  });

  it('setEligible(false) makes a sitting leader stand down for someone else', async () => {
    const a = tab('disable');
    const b = tab('disable', { eligible: false });
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 2);
    expect(a.getSnapshot().isLeader).toBe(true);

    // b is ineligible, so make it eligible first — otherwise nobody can take over.
    b.setEligible(true);
    a.setEligible(false);
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 2);

    expect(a.getSnapshot().isLeader).toBe(false);
    expect(b.getSnapshot().isLeader).toBe(true);

    a.close();
    b.close();
  });

  it('setEligible is a no-op when the value does not change', async () => {
    const a = tab('noop');
    await vi.advanceTimersByTimeAsync(HEARTBEAT);
    const snapshot = a.getSnapshot();

    a.setEligible(true);
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    expect(a.getSnapshot()).toBe(snapshot);
    a.close();
  });

  it('re-asserts against a stale claim rather than yielding the seat', async () => {
    const name = 'stale';
    const incumbent = tab(name);
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));

    await vi.advanceTimersByTimeAsync(HEARTBEAT);
    expect(incumbent.getSnapshot().isLeader).toBe(true);
    heard.length = 0;

    // A claim with a term the incumbent already beats (counter 1, lower clientId).
    rogue.post({
      v: 1,
      scope: 'leader',
      type: 'claim',
      term: [1, '000-rogue'],
      clientId: '000-rogue',
      kind: 'tab',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(incumbent.getSnapshot().isLeader).toBe(true);
    const reassert = heard.find((w) => w.scope === 'leader' && w.type === 'heartbeat');
    expect(reassert).toBeDefined();

    incumbent.close();
    rogue.close();
  });

  it('resigning when not the leader changes nothing', async () => {
    const a = tab('not-leader');
    const b = tab('not-leader');
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 3);

    const follower = a.getSnapshot().isLeader ? b : a;
    const leaderId = follower.getSnapshot().leaderId;

    follower.resign();
    await vi.advanceTimersByTimeAsync(0);

    expect(follower.getSnapshot().leaderId).toBe(leaderId);

    a.close();
    b.close();
  });

  it('ignores a resign from anyone who is not the leader', async () => {
    const name = 'fake-resign';
    const incumbent = tab(name);
    const rogue = hub.connect();
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    rogue.post({
      v: 1,
      scope: 'leader',
      type: 'resign',
      term: [1, 'nobody'],
      clientId: 'nobody',
      kind: 'tab',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(incumbent.getSnapshot().isLeader).toBe(true);

    incumbent.close();
    rogue.close();
  });

  it('ignores non-leader traffic on the bus', async () => {
    const name = 'other-scope';
    const a = tab(name);
    const rogue = hub.connect();
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    rogue.post({ v: 1, scope: 'presence', type: 'ping', clientId: 'x', kind: 'tab' });
    await vi.advanceTimersByTimeAsync(0);

    expect(a.getSnapshot().isLeader).toBe(true);
    a.close();
    rogue.close();
  });

  it('honours a custom kind without leaking leader timings onto the bus', async () => {
    const a = tab('kinded', { kind: 'worker' });
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));

    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    const claim = heard.find((w) => w.scope === 'leader' && w.type === 'claim');
    expect(claim?.kind).toBe('worker');

    a.close();
    rogue.close();
  });

  it('resigns on close and then falls silent', async () => {
    const name = 'closed';
    const a = tab(name);
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    a.close();
    await vi.advanceTimersByTimeAsync(0);

    // Closing hands the seat over deliberately rather than making peers wait
    // out the lease.
    expect(heard.some((w) => w.scope === 'leader' && w.type === 'resign')).toBe(true);

    // And nothing more after that — no heartbeats from a dead engine.
    heard.length = 0;
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 5);
    expect(heard.filter((w) => w.scope === 'leader')).toHaveLength(0);

    rogue.close();
  });

  it('uses the shared registry bus when no transport is given', async () => {
    // Every other test injects a transport, which bypasses the registry — this
    // is the branch real callers actually take.
    const a = createLeader('registry-bus');
    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    expect(a.getSnapshot()).toEqual({ leaderId: a.clientId, isLeader: true });
    a.close();
  });

  it('does not claim after close, even if made eligible again', async () => {
    const a = tab('closed-eligible', { eligible: false });
    a.close();

    a.setEligible(true);
    await vi.advanceTimersByTimeAsync(LEASE * 2);

    expect(a.getSnapshot().isLeader).toBe(false);
  });

  it('setEligible(false) on a follower leaves the leader alone', async () => {
    const leader = tab('standby');
    const follower = tab('standby');
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 3);

    const sitting = leader.getSnapshot().isLeader ? leader : follower;
    const standing = sitting === leader ? follower : leader;

    standing.setEligible(false);
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 2);

    expect(sitting.getSnapshot().isLeader).toBe(true);
    expect(standing.getSnapshot().leaderId).toBe(sitting.clientId);

    leader.close();
    follower.close();
  });

  it('a follower ignores a stale claim from a third party', async () => {
    const incumbent = tab('third-party');
    const follower = tab('third-party');
    const rogue = hub.connect();
    await vi.advanceTimersByTimeAsync(HEARTBEAT * 3);

    const leaderId = follower.getSnapshot().leaderId;

    // Not newer than the incumbent's term, and not from the leader either: the
    // follower must neither adopt it nor renew its lease against it.
    rogue.post({
      v: 1,
      scope: 'leader',
      type: 'claim',
      term: [1, '000-rogue'],
      clientId: '000-rogue',
      kind: 'tab',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(follower.getSnapshot().leaderId).toBe(leaderId);

    incumbent.close();
    follower.close();
    rogue.close();
  });

  it('drops a subscriber that unsubscribed', async () => {
    const a = tab('unsub');
    let calls = 0;
    const off = a.subscribe(() => calls++);
    off();

    await vi.advanceTimersByTimeAsync(HEARTBEAT);

    expect(calls).toBe(0);
    expect(a.getSnapshot().isLeader).toBe(true);
    a.close();
  });
});
