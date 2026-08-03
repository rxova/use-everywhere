import { describe, expect, it } from 'vitest';
import { isBusWire } from '../bus.js';
import type { BusWire } from '../bus.types.js';
import { isVersion } from '../clock.js';
import { createLeader } from '../leader.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

// Found by the property suite next door, pinned here as examples. A peer
// running a different deploy of your app is not hypothetical — it is what a
// rollout looks like from an already-open tab — and the wire is the one place
// a value's shape is a claim rather than a guarantee.
describe('malformed wires cannot take a tab down', () => {
  it('drops a patch whose version is not a version, and keeps working', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore<Record<string, unknown>>(
      'wv-patch',
      { a: 1 },
      { transport: () => hub.connect() },
    );
    const rogue = hub.connect();

    for (const version of ['not-a-version', undefined, null, [], [1], [NaN, 'z'], ['1', 'z']]) {
      rogue.post({
        v: 1,
        scope: 'state',
        type: 'patch',
        key: 'a',
        value: 999,
        version,
        clientId: 'z',
        kind: 'tab',
      } as unknown as BusWire);
    }
    await tick();

    // Nothing applied, nothing thrown, and the store is still live.
    expect(store.getSnapshot()['a']).toBe(1);
    store.set('a', 2);
    expect(store.getSnapshot()['a']).toBe(2);

    store.close();
    rogue.close();
  });

  it('drops a snapshot whose versions map is missing or malformed', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore<Record<string, unknown>>(
      'wv-snapshot',
      { a: 1 },
      { transport: () => hub.connect() },
    );
    const rogue = hub.connect();

    rogue.post({
      v: 1,
      scope: 'state',
      type: 'snapshot',
      state: { a: 42 },
      versions: undefined,
      clientId: 'z',
      kind: 'tab',
    } as unknown as BusWire);
    rogue.post({
      v: 1,
      scope: 'state',
      type: 'snapshot',
      state: { a: 43 },
      versions: { a: 'nope' },
      clientId: 'z',
      kind: 'tab',
    } as unknown as BusWire);
    await tick();

    expect(store.getSnapshot()['a']).toBe(1);
    store.close();
    rogue.close();
  });

  // Heartbeat only: a term is what that strategy arbitrates with, so a
  // malformed one has to be rejected before it reaches newer(). The Web Locks
  // strategy never reads terms — the lock decides who leads — so there is
  // nothing to validate there.
  it('drops a leader claim whose term is not a version', async () => {
    const hub = new MemoryHub();
    const leader = createLeader('wv-leader', {
      strategy: 'heartbeat',
      transport: () => hub.connect(),
    });
    const rogue = hub.connect();

    rogue.post({
      v: 1,
      scope: 'leader',
      type: 'claim',
      term: 'not-a-term',
      clientId: 'z',
      kind: 'tab',
    } as unknown as BusWire);
    await tick();

    // No crash, and the impostor did not take the seat.
    expect(leader.getSnapshot().leaderId).not.toBe('z');
    leader.close();
    rogue.close();
  });

  it('rejects envelopes missing the fields every branch reads', () => {
    expect(isBusWire({ v: 1, scope: 'state', type: 'patch', clientId: 'a' })).toBe(true);
    expect(isBusWire({ v: 1, scope: 'state', type: 'patch' })).toBe(false); // no clientId
    expect(isBusWire({ v: 1, scope: 'state', clientId: 'a' })).toBe(false); // no type
    expect(isBusWire({ v: 1, type: 'patch', clientId: 'a' })).toBe(false); // no scope
    expect(isBusWire({ v: 2, scope: 'state', type: 'patch', clientId: 'a' })).toBe(false);
    expect(isBusWire(null)).toBe(false);
    expect(isBusWire('nope')).toBe(false);
  });

  it('recognises exactly the version shape', () => {
    expect(isVersion([1, 'client'])).toBe(true);
    expect(isVersion([0, ''])).toBe(true);
    expect(isVersion([Infinity, 'c'])).toBe(false); // a counter must be comparable
    expect(isVersion([NaN, 'c'])).toBe(false);
    expect(isVersion(['1', 'c'])).toBe(false);
    expect(isVersion([1, 2])).toBe(false);
    expect(isVersion([1])).toBe(false);
    expect(isVersion([1, 'c', 'extra'])).toBe(false);
    expect(isVersion(undefined)).toBe(false);
  });
});
