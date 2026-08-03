import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { createPresence } from '../presence.js';
import { MemoryHub } from '../transport/memory-hub.js';

/**
 * The bug these describe: browsers clamp a hidden tab's timers to roughly one
 * tick a minute, so a healthy backgrounded peer stops heartbeating on schedule.
 * Pruning on silence alone made the roster oscillate — dropped, re-added on its
 * next slow ping, dropped again — once a minute, forever, for a tab that was
 * fine the whole time.
 *
 * A throttled peer is simulated by a raw hub client that answers `hello` (a
 * message handler, which browsers do *not* throttle) but never pings on a timer
 * of its own.
 */
describe('presence under timer throttling', () => {
  let hub: MemoryHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  /** A peer whose timers are clamped: silent on its own, but still answering. */
  function throttledPeer(id: string) {
    const client = hub.connect();
    client.subscribe((data) => {
      const wire = data as BusWire;
      if (wire.scope === 'presence' && wire.type === 'hello') {
        client.post({ v: 1, scope: 'presence', type: 'ping', clientId: id, kind: 'tab' });
      }
    });
    client.post({ v: 1, scope: 'presence', type: 'hello', clientId: id, kind: 'tab' });
    return client;
  }

  it('keeps a throttled peer in the roster instead of flapping it', async () => {
    const presence = createPresence('pt-keep', { transport: () => hub.connect() });
    const peer = throttledPeer('sleepy');
    await vi.advanceTimersByTimeAsync(100);
    expect(presence.getPeers().map((p) => p.id)).toEqual(['sleepy']);

    // Watch the roster across a minute of the peer never once pinging by timer.
    const seen: number[] = [];
    presence.subscribe(() => seen.push(presence.getPeers().length));
    await vi.advanceTimersByTimeAsync(60_000);

    // It answered every probe, so it was never dropped and never re-added:
    // no membership change at all.
    expect(seen).toEqual([]);
    expect(presence.getPeers().map((p) => p.id)).toEqual(['sleepy']);

    presence.close();
    peer.close();
  });

  it('still drops a peer that has genuinely gone', async () => {
    const presence = createPresence('pt-drop', { transport: () => hub.connect() });
    const ghost = hub.connect();
    ghost.post({ v: 1, scope: 'presence', type: 'hello', clientId: 'ghost', kind: 'tab' });
    await vi.advanceTimersByTimeAsync(100);
    expect(presence.getPeers()).toHaveLength(1);

    // It never answers the probe, because there is nobody there to answer.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(presence.getPeers()).toEqual([]);
    presence.close();
    ghost.close();
  });

  it('probes before dropping, rather than dropping and asking later', async () => {
    const presence = createPresence('pt-probe', { transport: () => hub.connect() });
    const observer = hub.connect();
    const hellos: BusWire[] = [];
    observer.subscribe((data) => {
      const wire = data as BusWire;
      if (wire.scope === 'presence' && wire.type === 'hello') hellos.push(wire);
    });

    const ghost = hub.connect();
    ghost.post({ v: 1, scope: 'presence', type: 'hello', clientId: 'ghost', kind: 'tab' });
    await vi.advanceTimersByTimeAsync(100);
    const before = hellos.length;

    // Past the silence threshold but inside the grace period: asked, not judged.
    await vi.advanceTimersByTimeAsync(5_500);
    expect(hellos.length).toBeGreaterThan(before);
    expect(presence.getPeers()).toHaveLength(1);

    presence.close();
    observer.close();
    ghost.close();
  });

  it('sends no probes at all while everyone is talking', async () => {
    const presence = createPresence('pt-quiet', { transport: () => hub.connect() });
    const chatty = hub.connect();
    const hellos: BusWire[] = [];
    const observer = hub.connect();
    observer.subscribe((data) => {
      const wire = data as BusWire;
      if (wire.scope === 'presence' && wire.type === 'hello') hellos.push(wire);
    });

    chatty.post({ v: 1, scope: 'presence', type: 'hello', clientId: 'chatty', kind: 'tab' });
    await vi.advanceTimersByTimeAsync(100);
    const baseline = hellos.length;

    // A peer pinging normally never looks suspect, so probing stays idle —
    // the mechanism costs nothing in the healthy case.
    for (let i = 0; i < 10; i++) {
      chatty.post({ v: 1, scope: 'presence', type: 'ping', clientId: 'chatty', kind: 'tab' });
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(hellos.length).toBe(baseline);
    expect(presence.getPeers()).toHaveLength(1);

    presence.close();
    chatty.close();
    observer.close();
  });

  it('a peer that answers late is kept, not resurrected', async () => {
    // Answering within the grace window must prevent the drop outright, so
    // subscribers never see the membership blip.
    const presence = createPresence('pt-late', {
      transport: () => hub.connect(),
      pruneAfterMs: 1_000,
      probeGraceMs: 500,
    });
    const peer = throttledPeer('slow');
    await vi.advanceTimersByTimeAsync(100);

    const changes: number[] = [];
    presence.subscribe(() => changes.push(presence.getPeers().length));
    await vi.advanceTimersByTimeAsync(20_000);

    expect(changes).toEqual([]);
    presence.close();
    peer.close();
  });
});
