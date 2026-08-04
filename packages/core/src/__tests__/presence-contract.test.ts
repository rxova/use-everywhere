import { describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { createPresence } from '../presence.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

/**
 * Presence behaviour nothing was checking, found by the mutation run: the wires
 * it emits (as opposed to the roster it ends up with), the probe boundary, and
 * the shape of a peer that published nothing.
 */
let n = 0;
const uniqueName = () => `pc-${++n}`;

const recorder = (hub: MemoryHub) => {
  const seen: BusWire[] = [];
  const wire = hub.connect();
  wire.subscribe((data) => seen.push(data as BusWire));
  return { seen, close: () => wire.close() };
};

const hellos = (seen: BusWire[]) =>
  seen.filter((w) => w.scope === 'presence' && w.type === 'hello');

describe('what setMetadata puts on the wire', () => {
  it('announces once when the value changes', async () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), { transport: () => hub.connect() });
    const rec = recorder(hub);
    await tick();

    presence.setMetadata({ display: 'Ada' });
    await tick();

    expect(hellos(rec.seen)).toHaveLength(1);
    presence.close();
    rec.close();
  });

  it('puts nothing on the wire when the value is unchanged', async () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      metadata: { display: 'Ada' },
    });
    const rec = recorder(hub);
    await tick();

    // A fresh object with the same contents, which is what a hook passes every
    // render. Asserted on the *wire*, not on the roster: an extra announcement
    // that happens to change nobody's roster is still traffic on every tab.
    presence.setMetadata({ display: 'Ada' });
    await tick();

    expect(hellos(rec.seen)).toHaveLength(0);
    presence.close();
    rec.close();
  });
});

describe('a peer that published nothing', () => {
  it('carries no metadata key at all, rather than an undefined one', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const watcher = createPresence(name, { transport: () => hub.connect() });
    const anonymous = createPresence(name, { transport: () => hub.connect() });
    await tick();

    const peer = watcher.getPeers()[0];
    expect(peer).toBeDefined();
    // `'metadata' in peer` rather than `peer.metadata === undefined`: an
    // explicit undefined would serialise onto the wire and read back as a peer
    // that announced "nothing", which is not the same as never announcing.
    expect(peer && 'metadata' in peer).toBe(false);

    watcher.close();
    anonymous.close();
  });

  it('is listed as itself with no metadata key when includeSelf is on', () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      includeSelf: true,
    });

    const self = presence.getPeers()[0];
    expect(self?.id).toBe(presence.clientId);
    expect(self && 'metadata' in self).toBe(false);

    presence.close();
  });

  it('does not announce a roster before anyone joins when includeSelf is off', async () => {
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), { transport: () => hub.connect() });
    let notifications = 0;
    presence.subscribe(() => notifications++);
    await tick();

    // Nothing has happened, so nothing should have been announced. The
    // includeSelf path notifies on creation; the default path must not.
    expect(notifications).toBe(0);
    presence.close();
  });
});

describe('the probe boundary', () => {
  it('drops a peer only once the grace period has fully elapsed', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      pruneAfterMs: 1000,
      probeGraceMs: 500,
    });
    hub.connect().post({
      v: 1,
      scope: 'presence',
      type: 'hello',
      clientId: 'ghost',
      kind: 'tab',
    } satisfies BusWire);
    await vi.advanceTimersByTimeAsync(1);
    expect(presence.getPeers()).toHaveLength(1);

    // Past pruneAfterMs: suspect, probed, still listed.
    await vi.advanceTimersByTimeAsync(1200);
    expect(presence.getPeers()).toHaveLength(1);

    // Probed, and silent through the whole grace period. Only now is it gone.
    await vi.advanceTimersByTimeAsync(600);
    expect(presence.getPeers()).toHaveLength(0);

    presence.close();
    vi.useRealTimers();
  });

  it('keeps a peer that answers the probe', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const wire = hub.connect();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      pruneAfterMs: 1000,
      probeGraceMs: 500,
    });
    const speak = () =>
      wire.post({
        v: 1,
        scope: 'presence',
        type: 'ping',
        clientId: 'alive',
        kind: 'tab',
      } satisfies BusWire);

    speak();
    await vi.advanceTimersByTimeAsync(1200); // suspect, probed
    speak(); // answers
    await vi.advanceTimersByTimeAsync(600);

    // Subscribers must see no membership change at all — not a drop and re-add.
    expect(presence.getPeers()).toHaveLength(1);

    presence.close();
    wire.close();
    vi.useRealTimers();
  });
});

describe('the roster at the moment of creation', () => {
  it('announces once when includeSelf is on, so the first read is not empty', () => {
    const hub = new MemoryHub();
    let notifications = 0;
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      includeSelf: true,
    });
    presence.subscribe(() => notifications++);

    // The notify happens during construction, before anything can subscribe —
    // what matters is that the snapshot is already populated.
    expect(presence.getPeers()).toHaveLength(1);
    expect(notifications).toBe(0);

    presence.close();
  });

  it('drops a peer the instant the grace period is met, not a tick later', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      pruneAfterMs: 1000,
      probeGraceMs: 500,
    });
    hub.connect().post({
      v: 1,
      scope: 'presence',
      type: 'hello',
      clientId: 'ghost',
      kind: 'tab',
    } satisfies BusWire);
    await vi.advanceTimersByTimeAsync(1);

    // Sweeps run every max(250, min(prune, grace)/2) = 250ms. The peer looks
    // suspect at the first sweep past 1000ms and is probed then; the drop needs
    // a further probeGraceMs to have *elapsed*, so it lands on the sweep at
    // ~1750ms. Asserting either side of that pins the boundary rather than
    // just "eventually gone".
    await vi.advanceTimersByTimeAsync(1600);
    expect(presence.getPeers()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(presence.getPeers()).toHaveLength(0);

    presence.close();
    vi.useRealTimers();
  });
});

describe('close', () => {
  it('is idempotent, and stops the prune timer', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const presence = createPresence(uniqueName(), {
      transport: () => hub.connect(),
      pruneAfterMs: 50,
      probeGraceMs: 50,
    });
    let notifications = 0;
    presence.subscribe(() => notifications++);

    presence.close();
    presence.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(notifications).toBe(0);
    vi.useRealTimers();
  });
});
