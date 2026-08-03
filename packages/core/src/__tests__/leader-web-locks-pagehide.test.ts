// @vitest-environment happy-dom
// Core's own tests run on node, where `hasWindow` is false and the pagehide
// registration is inert. The seat handover on tab close is the path that makes
// closing a window instant rather than "eventually", so it gets a real DOM.
import { describe, expect, it } from 'vitest';
import { createLeader } from '../leader.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { FakeLockManager } from './helpers/fake-locks.js';
import { tick } from './helpers/tick.js';

describe('Web Locks leader on pagehide', () => {
  it('gives up the seat, and a waiting tab takes it', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const holder = createLeader('wl-ph', { transport: () => hub.connect(), locks });
    const waiter = createLeader('wl-ph', { transport: () => hub.connect(), locks });
    await tick();
    expect(holder.getSnapshot().isLeader).toBe(true);

    dispatchEvent(new Event('pagehide'));
    await tick();

    expect(holder.getSnapshot().isLeader).toBe(false);
    expect(waiter.getSnapshot().isLeader).toBe(true);

    holder.close();
    waiter.close();
  });

  it('stops listening for pagehide once closed', async () => {
    const hub = new MemoryHub();
    const locks = new FakeLockManager();
    const leader = createLeader('wl-ph-closed', { transport: () => hub.connect(), locks });
    await tick();

    leader.close();
    await tick();

    // No handler left to run, and nothing held.
    expect(() => dispatchEvent(new Event('pagehide'))).not.toThrow();
    expect(locks.isHeld('wl-ph-closed')).toBe(false);
  });
});
