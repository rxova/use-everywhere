// @vitest-environment happy-dom
// Core runs on node, where `hasWindow` is false and the pagehide branch is
// dead. It is the path that makes closing a tab hand the seat over instantly
// instead of stalling every peer for a full lease, so it gets a real DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { createLeader } from '../leader.js';
import { MemoryHub } from '../transport/memory-hub.js';

describe('createLeader on pagehide', () => {
  let hub: MemoryHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  it('resigns the seat when the page goes away', async () => {
    const leader = createLeader('ph-resign', { transport: () => hub.connect() });
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));

    await vi.advanceTimersByTimeAsync(1000);
    expect(leader.getSnapshot().isLeader).toBe(true);

    dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    expect(heard.some((w) => w.scope === 'leader' && w.type === 'resign')).toBe(true);
    expect(leader.getSnapshot().isLeader).toBe(false);

    leader.close();
    rogue.close();
  });

  it('says nothing on pagehide when it was not leading', async () => {
    const leader = createLeader('ph-follower', { transport: () => hub.connect() });
    const follower = createLeader('ph-follower', { transport: () => hub.connect() });
    await vi.advanceTimersByTimeAsync(2000);

    const sitting = leader.getSnapshot().isLeader ? leader : follower;
    const standing = sitting === leader ? follower : leader;
    expect(standing.getSnapshot().isLeader).toBe(false);

    dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    // The incumbent resigned (it is in this page too), but the follower had no
    // seat to give up — it must not have posted a resign of its own.
    expect(standing.getSnapshot().isLeader).toBe(true);

    leader.close();
    follower.close();
  });

  it('stops listening for pagehide after close', async () => {
    const leader = createLeader('ph-close', { transport: () => hub.connect() });
    await vi.advanceTimersByTimeAsync(1000);
    leader.close();

    // Nothing is listening any more, so this must not throw or revive anything.
    expect(() => dispatchEvent(new Event('pagehide'))).not.toThrow();
    expect(leader.getSnapshot().isLeader).toBe(false);
  });
});
