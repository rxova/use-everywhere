// @vitest-environment happy-dom
// A tab restored from the back/forward cache said `bye` on the way out and
// heard nothing while cached. Without a re-handshake it would hold silently
// stale state forever — the pageshow handlers under test are what close that
// hole. Only `persisted: true` restores re-announce; a normal load's pageshow
// must stay quiet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '../bus.js';
import type { BusWire } from '../bus.types.js';
import { createLeader } from '../leader.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';

const restore = () => dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

describe('bfcache restore', () => {
  let hub: MemoryHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  it('the bus re-announces presence on a persisted pageshow, and only then', async () => {
    const bus = getBus('bf-bus', { transport: () => hub.connect() });
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));

    dispatchEvent(new Event('pageshow')); // a normal load: not a restore
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.filter((w) => w.scope === 'presence' && w.type === 'hello')).toHaveLength(0);

    restore();
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.filter((w) => w.scope === 'presence' && w.type === 'hello')).toHaveLength(1);

    bus.release();
    restore();
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.filter((w) => w.scope === 'presence' && w.type === 'hello')).toHaveLength(1);
    rogue.close();
  });

  it('the store re-runs the late-joiner handshake and converges on the reply', async () => {
    const store = createSharedStore<{ n: number }>(
      'bf-store',
      { n: 0 },
      { transport: () => hub.connect() },
    );
    const rogue = hub.connect();
    const hellos: BusWire[] = [];
    rogue.subscribe((data) => {
      const wire = data as BusWire;
      if (wire.scope !== 'state' || wire.type !== 'hello') return;
      hellos.push(wire);
      // An incumbent answers a hello with its full state — exactly what the
      // restored tab missed while cached.
      rogue.post({
        v: 1,
        scope: 'state',
        type: 'snapshot',
        clientId: 'zz',
        kind: 'tab',
        state: { n: 7 },
        versions: { n: [5, 'zz'] },
      });
    });

    dispatchEvent(new Event('pageshow')); // a normal load: no re-handshake
    await vi.advanceTimersByTimeAsync(0);
    expect(hellos).toHaveLength(0);

    restore();
    await vi.advanceTimersByTimeAsync(0);

    expect(hellos).toHaveLength(1);
    expect(store.getSnapshot().n).toBe(7);

    store.close();
    restore();
    await vi.advanceTimersByTimeAsync(0);
    expect(hellos).toHaveLength(1); // closed store no longer re-hellos
    rogue.close();
  });

  it('a solo leader that resigned on pagehide reclaims the seat after restore', async () => {
    const leader = createLeader('bf-lead-solo', { transport: () => hub.connect() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(leader.getSnapshot().isLeader).toBe(true);

    dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(leader.getSnapshot().isLeader).toBe(false);

    dispatchEvent(new Event('pageshow')); // a normal load: no rejoin
    await vi.advanceTimersByTimeAsync(0);
    expect(leader.getSnapshot().isLeader).toBe(false);

    restore();
    await vi.advanceTimersByTimeAsync(1000); // one silent beat: the seat is free
    expect(leader.getSnapshot().isLeader).toBe(true);

    leader.close();
  });

  it('a restored tab adopts the incumbent that answers its hello instead of stealing the seat', async () => {
    const leader = createLeader('bf-lead-adopt', { transport: () => hub.connect() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(leader.getSnapshot().isLeader).toBe(true);

    dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    // While we were cached, another tab took over.
    const rogue = hub.connect();
    rogue.subscribe((data) => {
      const wire = data as BusWire;
      if (wire.scope === 'leader' && wire.type === 'hello') {
        rogue.post({
          v: 1,
          scope: 'leader',
          type: 'heartbeat',
          term: [10, 'zz'],
          clientId: 'zz',
          kind: 'tab',
        });
      }
    });

    restore();
    await vi.advanceTimersByTimeAsync(0);
    expect(leader.getSnapshot()).toMatchObject({ leaderId: 'zz', isLeader: false });

    leader.close();
    rogue.close();
  });
});
