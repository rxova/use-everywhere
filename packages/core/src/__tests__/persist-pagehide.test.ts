// @vitest-environment happy-dom
// Core runs on node, where `hasWindow` is false and the pagehide flush is dead
// code. It is the path that makes a value survive closing the last tab mid-
// debounce, which is the whole promise of persistence, so it gets a real DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Persisted, StorageLike } from '../index.js';
import { webStorageAdapter } from '../persist-web-storage.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';

describe('persist on pagehide', () => {
  let hub: MemoryHub;
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  it('flushes a pending write when the page goes away', () => {
    const map = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
    const store = createSharedStore<Record<string, unknown>>(
      'ph-persist',
      {},
      {
        transport: () => hub.connect(),
        // Long enough that only the pagehide flush can save this value.
        persist: { adapter: webStorageAdapter(storage, 'k'), debounceMs: 10_000 },
      },
    );

    store.set('draft', 'half-typed');
    expect(map.has('k')).toBe(false); // still inside the debounce

    dispatchEvent(new Event('pagehide'));

    expect((JSON.parse(map.get('k') ?? '{}') as Persisted).state).toEqual({
      draft: 'half-typed',
    });

    store.close();
  });

  it('stops listening for pagehide once closed', () => {
    const map = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
    const store = createSharedStore<Record<string, unknown>>(
      'ph-closed',
      {},
      {
        transport: () => hub.connect(),
        persist: { adapter: webStorageAdapter(storage, 'k'), debounceMs: 10_000 },
      },
    );

    store.set('a', 1);
    store.close(); // flushes
    map.clear();

    dispatchEvent(new Event('pagehide'));

    // The listener is gone, so nothing rewrites the entry after close.
    expect(map.has('k')).toBe(false);
  });
});
