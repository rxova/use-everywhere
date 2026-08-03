// @vitest-environment happy-dom
// The storage-event transport needs a real `addEventListener` and a real
// StorageEvent to be worth testing at all, so this file gets a DOM.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSharedStore } from '../shared-store.js';
import { StorageTransport } from '../transport/storage-transport.js';
import { tick } from './helpers/tick.js';

const KEY = 'use-everywhere:bus:st';

/**
 * `localStorage` in one page cannot fire its own `storage` event — the browser
 * only delivers it to *other* tabs. So a second tab is simulated by dispatching
 * the event the browser would have delivered, carrying whatever the writer put
 * in storage.
 */
function deliverToPeers(newValue: string | null, key = KEY) {
  dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

/**
 * A Storage-shaped double, injected rather than spied onto the global. Spying
 * on `Storage.prototype` leaks between tests in this file — one test's mock
 * outlives it and the next one's writes vanish — and injection is what the
 * constructor's `storage` parameter is for.
 */
function fakeStorage() {
  const writes: string[] = [];
  const removed: string[] = [];
  const storage = {
    getItem: () => null,
    setItem: (k: string, v: string) => {
      if (k === KEY) writes.push(v);
    },
    removeItem: (k: string) => void removed.push(k),
  } as unknown as Storage;
  return { storage, writes, removed };
}

describe('StorageTransport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('announces itself as the storage transport', () => {
    const transport = new StorageTransport('st');
    expect(transport.kind).toBe('storage');
    transport.close();
  });

  it('delivers what a peer wrote, and ignores the removal that follows it', () => {
    const transport = new StorageTransport('st');
    const heard: unknown[] = [];
    transport.subscribe((data) => heard.push(data));

    deliverToPeers(JSON.stringify({ seq: 0, data: { hello: 'world' } }));
    // Every write is followed by a delete so application state does not linger
    // in localStorage; the null-valued event it produces must not be delivered.
    deliverToPeers(null);

    expect(heard).toEqual([{ hello: 'world' }]);
    transport.close();
  });

  it('ignores traffic on other keys and unparseable payloads', () => {
    const transport = new StorageTransport('st');
    const heard: unknown[] = [];
    transport.subscribe((data) => heard.push(data));

    deliverToPeers(JSON.stringify({ seq: 0, data: 'nope' }), 'someone-elses-key');
    deliverToPeers('{truncated');

    expect(heard).toEqual([]);
    transport.close();
  });

  it('writes then immediately removes, leaving nothing behind', () => {
    const { storage, writes, removed } = fakeStorage();
    const transport = new StorageTransport('st', storage);

    transport.post({ a: 1 });

    expect(writes[0]).toContain('"a":1');
    expect(removed).toContain(KEY);
    transport.close();
  });

  it('makes every write distinct, so two identical posts both deliver', () => {
    const { storage, writes } = fakeStorage();
    const transport = new StorageTransport('st', storage);

    transport.post({ same: true });
    transport.post({ same: true });

    // setItem with an unchanged value fires no storage event, so identical
    // consecutive posts would silently deliver once without the sequence.
    expect(writes).toHaveLength(2);
    expect(writes[0]).not.toBe(writes[1]);
    transport.close();
  });

  it('rejects values JSON would silently drop, rather than diverging', () => {
    const transport = new StorageTransport('st', fakeStorage().storage);

    // JSON.stringify turns these into nothing at all, which would let a write
    // look successful while peers received a different object.
    expect(() => transport.post({ onDone: () => {} })).toThrow(/function/);
    expect(() => transport.post({ tag: Symbol('x') })).toThrow(/symbol/);

    transport.close();
  });

  it('survives a storage write that throws — delivery is best-effort', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    } as unknown as Storage;
    const transport = new StorageTransport('st', failing);

    expect(() => transport.post({ a: 1 })).not.toThrow();
    transport.close();
  });

  it('stops listening once closed', () => {
    const transport = new StorageTransport('st');
    const heard: unknown[] = [];
    transport.subscribe((data) => heard.push(data));

    transport.close();
    deliverToPeers(JSON.stringify({ seq: 0, data: 'after close' }));

    expect(heard).toEqual([]);
  });

  it('unsubscribing removes only that listener', () => {
    const transport = new StorageTransport('st');
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = transport.subscribe((d) => a.push(d));
    transport.subscribe((d) => b.push(d));

    offA();
    deliverToPeers(JSON.stringify({ seq: 0, data: 1 }));

    expect(a).toEqual([]);
    expect(b).toEqual([1]);
    transport.close();
  });

  it('carries a real store between two tabs', async () => {
    // End to end on the fallback: a store writes, and the event the browser
    // would deliver reaches a second store, which converges.
    const { storage, writes } = fakeStorage();
    const writer = createSharedStore<{ n: number }>(
      'st',
      { n: 0 },
      { transport: (name) => new StorageTransport(name, storage) },
    );
    const reader = createSharedStore<{ n: number }>(
      'st',
      { n: 0 },
      { transport: (name) => new StorageTransport(name, storage) },
    );

    writer.set('n', 42);
    for (const value of writes) deliverToPeers(value);
    await tick();

    expect(reader.getSnapshot().n).toBe(42);
    writer.close();
    reader.close();
  });
});
