import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { resetRendezvous } from '../rendezvous.js';
import { createPresence } from '../presence.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { foreignWireVersion, getWireSkew, isBusWire, WIRE_VERSION } from '../wire.js';
import { tick } from './helpers/tick.js';

/**
 * Version skew is not an edge case, it is what a rolling deploy looks like from
 * an already-open tab: for as long as it takes users to reload, two generations
 * of the bundle are on the origin talking over the same bus. The contract is
 * that they partition rather than corrupt each other, and that the partition is
 * observable instead of silent. These are the tests for both halves.
 */
const foreign = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    v: 2,
    scope: 'state',
    type: 'patch',
    key: 'a',
    value: 999,
    version: [99, 'future'],
    clientId: 'from-next-week',
    kind: 'tab',
    ...over,
  }) as unknown as BusWire;

describe('a peer speaking another wire protocol version', () => {
  beforeEach(() => resetRendezvous());
  afterEach(() => {
    resetRendezvous();
    vi.restoreAllMocks();
  });

  it('cannot write to a store on this version', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore<Record<string, unknown>>(
      'skew-write',
      { a: 1 },
      {
        transport: () => hub.connect(),
      },
    );
    const nextWeek = hub.connect();

    nextWeek.post(foreign());
    await tick();

    // The version clock says [99, …], which would beat anything this build
    // holds — so it is the envelope check, not last-writer-wins, doing the work.
    expect(store.getSnapshot()['a']).toBe(1);

    store.close();
    nextWeek.close();
  });

  it('is reported by getWireSkew, per bus name', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore('skew-observed', { a: 1 }, { transport: () => hub.connect() });
    const nextWeek = hub.connect();

    expect(getWireSkew('skew-observed')).toEqual([]);

    nextWeek.post(foreign({ v: 3 }));
    nextWeek.post(foreign({ v: 2 }));
    await tick();

    // Ascending, deduped, and scoped to the bus that heard it.
    expect(getWireSkew('skew-observed')).toEqual([2, 3]);
    expect(getWireSkew('some-other-bus')).toEqual([]);

    store.close();
    nextWeek.close();
  });

  it('outlives the bus that heard it', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore('skew-outlives', { a: 1 }, { transport: () => hub.connect() });
    const nextWeek = hub.connect();

    nextWeek.post(foreign());
    await tick();
    store.close();

    // Closing a store does not un-deploy the build that produced the skew, so
    // the mark stays: a "reload for the latest version" prompt gated on this
    // must not flicker off because some component unmounted.
    expect(getWireSkew('skew-outlives')).toEqual([2]);
    nextWeek.close();
  });

  it('warns once per version, naming the direction', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const store = createSharedStore('skew-warn', { a: 1 }, { transport: () => hub.connect() });
    const nextWeek = hub.connect();

    nextWeek.post(foreign({ v: 2 }));
    nextWeek.post(foreign({ v: 2 }));
    await tick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('wire protocol v2');
    expect(warn.mock.calls[0]?.[0]).toContain('newer');

    store.close();
    nextWeek.close();
  });

  it('calls a lower version older', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const store = createSharedStore('skew-older', { a: 1 }, { transport: () => hub.connect() });
    const lastWeek = hub.connect();

    lastWeek.post(foreign({ v: 0 }));
    await tick();

    expect(warn.mock.calls[0]?.[0]).toContain('older');

    store.close();
    lastWeek.close();
  });

  it('does not become a peer, hold a seat, or answer a hello', async () => {
    const hub = new MemoryHub();
    const presence = createPresence('skew-presence', { transport: () => hub.connect() });
    const nextWeek = hub.connect();

    nextWeek.post(foreign({ scope: 'presence', type: 'hello' }));
    await tick();

    // Partitioned means partitioned in both directions: a generation we cannot
    // read is also one we must not count as present.
    expect(presence.getPeers()).toHaveLength(0);

    presence.close();
    nextWeek.close();
  });
});

describe('telling a skewed peer from an unrelated script', () => {
  beforeEach(() => resetRendezvous());
  afterEach(() => resetRendezvous());

  it('recognises a full envelope carrying a foreign version', () => {
    expect(foreignWireVersion(foreign())).toBe(2);
    expect(foreignWireVersion(foreign({ v: 0 }))).toBe(0);
  });

  it('ignores anything that is not recognisably one of ours', () => {
    // A bus name is just a BroadcastChannel name, and the origin is shared with
    // every other script on it. Reporting a neighbour's traffic as a stale
    // deploy would make the signal useless.
    expect(foreignWireVersion({ v: 2 })).toBe(null);
    expect(foreignWireVersion({ v: '2', scope: 's', type: 't', clientId: 'c' })).toBe(null);
    expect(foreignWireVersion({ v: 2, scope: 1, type: 't', clientId: 'c' })).toBe(null);
    expect(foreignWireVersion({ v: 2, scope: 's', type: 1, clientId: 'c' })).toBe(null);
    expect(foreignWireVersion({ v: 2, scope: 's', type: 't' })).toBe(null);
    expect(foreignWireVersion({ hello: 'from some other library' })).toBe(null);
    expect(foreignWireVersion(null)).toBe(null);
    expect(foreignWireVersion('nope')).toBe(null);
  });

  it('records each foreign version once, however often it is heard', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore('skew-once', { a: 1 }, { transport: () => hub.connect() });
    const nextWeek = hub.connect();

    for (let i = 0; i < 5; i++) nextWeek.post(foreign({ v: 2 }));
    await tick();

    // The ledger is a set, not a log: a peer on another deploy talks constantly,
    // and reporting it once per wire would make the signal unusable.
    expect(getWireSkew('skew-once')).toEqual([2]);

    store.close();
    nextWeek.close();
  });

  it('calls an equal version neither newer nor older, because it is not foreign', () => {
    // The direction wording is decided by a strict comparison, so the boundary
    // case has to be the one that never reaches it at all.
    expect(foreignWireVersion(foreign({ v: WIRE_VERSION }))).toBe(null);
  });

  it('does not call our own version foreign', () => {
    expect(foreignWireVersion(foreign({ v: WIRE_VERSION }))).toBe(null);
    expect(isBusWire(foreign({ v: WIRE_VERSION }))).toBe(true);
  });
});

describe('additive evolution within a wire version', () => {
  beforeEach(() => resetRendezvous());
  afterEach(() => resetRendezvous());

  it('ignores a state wire type this build has never heard of', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore<Record<string, unknown>>(
      'skew-additive',
      { a: 1 },
      {
        transport: () => hub.connect(),
      },
    );
    const laterBuild = hub.connect();

    // What adding `remove` in a future minor looks like to a tab running today's
    // build. It must be nothing at all — not a snapshot, which is what the old
    // `else` made of it, and not skew either, because the protocol has not
    // changed. Sent with a state map attached precisely because the old branch
    // would have read one.
    laterBuild.post({
      v: 1,
      scope: 'state',
      type: 'remove',
      key: 'a',
      state: { a: 999 },
      versions: { a: [99, 'later'] },
      clientId: 'later-build',
      kind: 'tab',
    } as unknown as BusWire);
    await tick();

    expect(store.getSnapshot()['a']).toBe(1);
    expect(getWireSkew('skew-additive')).toEqual([]);

    // Still live, and still hearing the types it does know.
    laterBuild.post({
      v: 1,
      scope: 'state',
      type: 'patch',
      key: 'a',
      value: 2,
      version: [5, 'later'],
      clientId: 'later-build',
      kind: 'tab',
    });
    await tick();
    expect(store.getSnapshot()['a']).toBe(2);

    store.close();
    laterBuild.close();
  });
});
