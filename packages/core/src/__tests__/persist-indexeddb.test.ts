// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexedDbAdapter } from '../persist-indexeddb.js';
import type { Persisted } from '../persist.types.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';

/**
 * The adapter the async half of persistence was built for: `store.hydrated`
 * and `useHydrated` exist because a read that resolves later leaves a window a
 * keystroke can be lost in, and until now nothing in the library actually had
 * one.
 */
const saved = (state: Record<string, unknown>): Persisted => ({
  v: 1,
  state,
  versions: Object.fromEntries(
    Object.keys(state).map((k) => [k, [5, 'disk']]),
  ) as Persisted['versions'],
});

let n = 0;
const uniqueKey = () => `idb-${++n}`;

describe('indexedDbAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips a snapshot', async () => {
    const adapter = indexedDbAdapter(uniqueKey());
    const snapshot = saved({ theme: 'dark' });

    await adapter.write(snapshot);

    expect(await adapter.read()).toEqual(snapshot);
  });

  it('returns undefined when nothing was ever written', async () => {
    expect(await indexedDbAdapter(uniqueKey()).read()).toBeUndefined();
  });

  it('keeps Dates, Maps and Sets, with no serializer involved', async () => {
    const key = uniqueKey();
    const adapter = indexedDbAdapter(key);
    const when = new Date('2020-01-02T03:04:05.000Z');
    await adapter.write(saved({ when, tags: new Set(['a']), index: new Map([['k', 1]]) }));

    const back = (await adapter.read()) as Persisted;

    // IndexedDB stores with the structured clone algorithm — the same one
    // BroadcastChannel uses — so the JSON-degrades-your-types problem the
    // Serializer seam exists for simply is not present here.
    expect(back.state.when).toBeInstanceOf(Date);
    expect((back.state.when as Date).toISOString()).toBe(when.toISOString());
    expect(back.state.tags).toBeInstanceOf(Set);
    expect(back.state.index).toBeInstanceOf(Map);
  });

  it('removes what it wrote', async () => {
    const key = uniqueKey();
    const adapter = indexedDbAdapter(key);
    await adapter.write(saved({ a: 1 }));

    await adapter.remove?.();

    expect(await adapter.read()).toBeUndefined();
  });

  it('keeps two keys in one database apart', async () => {
    const database = `db-${++n}`;
    const first = indexedDbAdapter('one', { database });
    const second = indexedDbAdapter('two', { database });

    await first.write(saved({ a: 1 }));
    await second.write(saved({ a: 2 }));

    expect(((await first.read()) as Persisted).state.a).toBe(1);
    expect(((await second.read()) as Persisted).state.a).toBe(2);
  });

  it('degrades to a no-op and reports when the database cannot be opened', async () => {
    const onError = vi.fn();
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    const adapter = indexedDbAdapter(uniqueKey(), { onError });

    // Best-effort is the contract for every adapter: a store that cannot
    // restore is still a working store.
    expect(await adapter.read()).toBeUndefined();
    await adapter.write(saved({ a: 1 }));
    await adapter.remove?.();

    expect(onError.mock.calls.map((c) => c[1])).toEqual(['read', 'write', 'remove']);
  });

  it('reports an open that fails asynchronously', async () => {
    const onError = vi.fn();
    const fake = {} as IDBOpenDBRequest;
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      // Resolved on the next tick, the way a real failing open behaves.
      queueMicrotask(() => {
        Object.defineProperty(fake, 'error', { value: new Error('nope'), configurable: true });
        fake.onerror?.(new Event('error') as never);
      });
      return fake;
    });

    expect(await indexedDbAdapter(uniqueKey(), { onError }).read()).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.anything(), 'read');
  });

  it('fails rather than hanging when another tab blocks an upgrade', async () => {
    const onError = vi.fn();
    const fake = {} as IDBOpenDBRequest;
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      queueMicrotask(() => fake.onblocked?.(new Event('blocked') as never));
      return fake;
    });

    // A promise nothing will ever settle is the worst outcome here: the store
    // would sit un-hydrated forever with `hydrated` never resolving.
    expect(await indexedDbAdapter(uniqueKey(), { onError }).read()).toBeUndefined();
    expect(String(onError.mock.calls[0]?.[0])).toMatch(/blocked/);
  });

  it('reports a read that opens fine and then fails', async () => {
    const onError = vi.fn();
    const key = uniqueKey();
    const adapter = indexedDbAdapter(key);
    // Open once so the connection is real and cached, then break the request
    // that runs on it — a quota or a corrupt record, rather than a bad open.
    await adapter.read();

    const failing = {} as IDBRequest<unknown>;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockReturnValue({
      objectStore: () => ({
        get: () => {
          queueMicrotask(() => {
            Object.defineProperty(failing, 'error', {
              value: new Error('corrupt'),
              configurable: true,
            });
            failing.onerror?.(new Event('error') as never);
          });
          return failing;
        },
      }),
    } as never);

    const broken = indexedDbAdapter(key, { onError });
    expect(await broken.read()).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.anything(), 'read');
  });

  it('does not let a throwing onError become the failure it reports', async () => {
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    const adapter = indexedDbAdapter(uniqueKey(), {
      onError: () => {
        throw new Error('telemetry is down');
      },
    });

    await expect(adapter.read()).resolves.toBeUndefined();
  });
});

describe('a store persisted to IndexedDB', () => {
  it('restores through hydrated, which is the window that needs it', async () => {
    const key = uniqueKey();
    const adapter = indexedDbAdapter(key);
    await adapter.write(saved({ draft: 'from disk' }));

    const hub = new MemoryHub();
    const store = createSharedStore(
      'idb-store',
      { draft: '' },
      { transport: () => hub.connect(), persist: { adapter } },
    );

    // The store is handed back before the read resolves — the whole reason
    // `hydrated` exists. A write landing here is discarded by last-writer-wins
    // when the restore arrives holding a higher counter.
    expect(store.getSnapshot().draft).toBe('');

    await store.hydrated;

    expect(store.getSnapshot().draft).toBe('from disk');
    store.close();
  });
});
