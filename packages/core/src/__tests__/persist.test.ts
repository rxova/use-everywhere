import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Version } from '../common.types.js';
import {
  localStorageAdapter,
  sessionStorageAdapter,
  webStorageAdapter,
} from '../persist-web-storage.js';
import type { Persisted, PersistAdapter, StorageLike } from '../index.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';

/** A Storage-shaped Map, so tests can inspect exactly what hit the disk. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const storage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

const saved = (state: Record<string, unknown>, versions: Record<string, Version>): string =>
  JSON.stringify({ v: 1, state, versions } satisfies Persisted);

describe('webStorageAdapter', () => {
  it('round-trips a snapshot', () => {
    const { storage } = fakeStorage();
    const adapter = webStorageAdapter(storage, 'k');

    adapter.write({ v: 1, state: { a: 1 }, versions: { a: [2, 'c1'] } });

    expect(adapter.read()).toEqual({ v: 1, state: { a: 1 }, versions: { a: [2, 'c1'] } });
  });

  it('returns undefined for nothing stored, corrupt JSON, or a foreign schema', () => {
    expect(webStorageAdapter(fakeStorage().storage, 'k').read()).toBeUndefined();
    expect(webStorageAdapter(fakeStorage({ k: '{not json' }).storage, 'k').read()).toBeUndefined();
    expect(
      webStorageAdapter(fakeStorage({ k: '{"v":2,"state":{},"versions":{}}' }).storage, 'k').read(),
    ).toBeUndefined();
    expect(webStorageAdapter(fakeStorage({ k: 'null' }).storage, 'k').read()).toBeUndefined();
  });

  it('removes the entry', () => {
    const { storage, map } = fakeStorage();
    const adapter = webStorageAdapter(storage, 'k');
    adapter.write({ v: 1, state: { a: 1 }, versions: { a: [1, 'c'] } });

    adapter.remove?.();

    expect(map.has('k')).toBe(false);
  });

  it('degrades to a no-op when storage is blocked', () => {
    // Reading globalThis.localStorage itself throws when storage is blocked —
    // which is why the adapter takes a thunk and calls it inside try/catch.
    const blocked = webStorageAdapter(() => {
      throw new Error('SecurityError');
    }, 'k');

    expect(() => blocked.write({ v: 1, state: {}, versions: {} })).not.toThrow();
    expect(() => blocked.remove?.()).not.toThrow();
    expect(blocked.read()).toBeUndefined();
  });

  it('swallows a full quota', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(() =>
      webStorageAdapter(storage, 'k').write({ v: 1, state: { a: 1 }, versions: { a: [1, 'c'] } }),
    ).not.toThrow();
  });

  it('survives storage that is simply absent', () => {
    const adapter = webStorageAdapter(() => undefined, 'k');

    expect(adapter.read()).toBeUndefined();
    expect(() => adapter.write({ v: 1, state: {}, versions: {} })).not.toThrow();
    expect(() => adapter.remove?.()).not.toThrow();
  });
});

describe('localStorageAdapter / sessionStorageAdapter', () => {
  it('read the matching web storage lazily', () => {
    const local = fakeStorage({ ls: saved({ a: 1 }, { a: [1, 'c'] }) });
    const session = fakeStorage({ ss: saved({ b: 2 }, { b: [1, 'c'] }) });
    vi.stubGlobal('localStorage', local.storage);
    vi.stubGlobal('sessionStorage', session.storage);

    expect((localStorageAdapter('ls').read() as Persisted | undefined)?.state).toEqual({ a: 1 });
    expect((sessionStorageAdapter('ss').read() as Persisted | undefined)?.state).toEqual({ b: 2 });

    vi.unstubAllGlobals();
  });
});

describe('createSharedStore with persist', () => {
  let hub: MemoryHub;
  type Shape = Record<string, unknown>;
  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => vi.useRealTimers());

  const store = (name: string, adapter: PersistAdapter, extra = {}) =>
    createSharedStore<Shape>(
      name,
      {},
      {
        transport: () => hub.connect(),
        persist: { adapter, ...extra },
      },
    );

  it('restores a value, and registerKey cannot clobber it', () => {
    const { storage } = fakeStorage({ k: saved({ theme: 'dark' }, { theme: [3, 'old'] }) });
    const s = store('p-restore', webStorageAdapter(storage, 'k'));

    // The hook's initial arrives after construction; hydration already wrote
    // versions['theme'], so registerKey is a no-op and the restore survives.
    s.registerKey('theme', 'light');

    expect(s.getSnapshot()['theme']).toBe('dark');
    expect(s.getVersions()['theme']).toEqual([3, 'old']);
    s.close();
  });

  it('loses to a live tab holding something newer', async () => {
    const live = createSharedStore<Shape>('p-lose', {}, { transport: () => hub.connect() });
    live.set('theme', 'neon'); // version [1, live]
    live.set('theme', 'neon2'); // version [2, live]
    await vi.advanceTimersByTimeAsync(0);

    const { storage } = fakeStorage({ k: saved({ theme: 'dark' }, { theme: [1, 'aaa'] }) });
    const restored = store('p-lose', webStorageAdapter(storage, 'k'));
    await vi.advanceTimersByTimeAsync(0);

    // [1,'aaa'] loses to [2,live]: the live tab's value wins, both converge.
    expect(restored.getSnapshot()['theme']).toBe('neon2');
    expect(live.getSnapshot()['theme']).toBe('neon2');

    live.close();
    restored.close();
  });

  it('wins over a staler live tab — and drags it along via the re-broadcast', async () => {
    const live = createSharedStore<Shape>('p-win', {}, { transport: () => hub.connect() });
    live.set('theme', 'old'); // [1, live]
    await vi.advanceTimersByTimeAsync(0);

    const { storage } = fakeStorage({ k: saved({ theme: 'fresh' }, { theme: [9, 'zzz'] }) });
    const restored = store('p-win', webStorageAdapter(storage, 'k'));
    await vi.advanceTimersByTimeAsync(0);

    expect(restored.getSnapshot()['theme']).toBe('fresh');
    // This is the assertion that proves the re-broadcast is load-bearing.
    // hello/snapshot only flows incumbent -> joiner, so without our patch the
    // live tab would sit on 'old' forever and the two would diverge.
    expect(live.getSnapshot()['theme']).toBe('fresh');

    live.close();
    restored.close();
  });

  it('writes through on local and remote changes, debounced', async () => {
    const { storage, map } = fakeStorage();
    const s = store('p-write', webStorageAdapter(storage, 'k'), { debounceMs: 50 });

    s.set('count', 1);
    s.set('count', 2);
    s.set('count', 3);
    expect(map.has('k')).toBe(false); // still coalescing

    await vi.advanceTimersByTimeAsync(50);

    const written = JSON.parse(map.get('k') ?? '{}') as Persisted;
    expect(written.state).toEqual({ count: 3 }); // one write, not three
    expect(written.versions['count']).toEqual([3, s.clientId]);

    s.close();
  });

  it('persists what a peer wrote, so any tab can restore the converged state', async () => {
    const { storage, map } = fakeStorage();
    const mine = store('p-remote', webStorageAdapter(storage, 'k'), { debounceMs: 10 });
    const peer = createSharedStore<Shape>('p-remote', {}, { transport: () => hub.connect() });

    peer.set('theme', 'from-peer');
    await vi.advanceTimersByTimeAsync(20);

    expect((JSON.parse(map.get('k') ?? '{}') as Persisted).state).toEqual({ theme: 'from-peer' });

    mine.close();
    peer.close();
  });

  it('never persists a key that was only registered', async () => {
    const { storage, map } = fakeStorage();
    const s = store('p-zero', webStorageAdapter(storage, 'k'), { debounceMs: 10 });

    s.registerKey('untouched', 'initial'); // version [0, clientId]
    s.set('written', 'yes'); // version [1, clientId]
    await vi.advanceTimersByTimeAsync(20);

    const written = JSON.parse(map.get('k') ?? '{}') as Persisted;
    // A counter-0 version is somebody's `initial`, not data. Storing it would
    // let a restored initial beat another tab's initial on the clientId
    // tie-break — a silent divergence.
    expect(written.state).toEqual({ written: 'yes' });
    expect(written.versions['untouched']).toBeUndefined();

    s.close();
  });

  it('honours a keys filter in both directions', async () => {
    const { storage, map } = fakeStorage({
      k: saved({ keep: 'yes', drop: 'no' }, { keep: [1, 'a'], drop: [1, 'a'] }),
    });
    const s = store('p-keys', webStorageAdapter(storage, 'k'), {
      keys: ['keep'],
      debounceMs: 10,
    });

    expect(s.getSnapshot()['keep']).toBe('yes');
    expect(s.getSnapshot()['drop']).toBeUndefined(); // not hydrated

    s.set('drop', 'still no');
    s.set('keep', 'yes2');
    await vi.advanceTimersByTimeAsync(20);

    const written = JSON.parse(map.get('k') ?? '{}') as Persisted;
    expect(written.state).toEqual({ keep: 'yes2' }); // not persisted either
    s.close();
  });

  it('skips a persisted key that has no version', () => {
    const { storage } = fakeStorage({
      k: JSON.stringify({ v: 1, state: { orphan: 'x' }, versions: {} }),
    });
    const s = store('p-orphan', webStorageAdapter(storage, 'k'));

    expect(s.getSnapshot()['orphan']).toBeUndefined();
    s.close();
  });

  it('flushes synchronously on close, without waiting for the debounce', () => {
    const { storage, map } = fakeStorage();
    const s = store('p-close', webStorageAdapter(storage, 'k'), { debounceMs: 10_000 });

    s.set('a', 1);
    s.close();

    expect((JSON.parse(map.get('k') ?? '{}') as Persisted).state).toEqual({ a: 1 });
  });

  it('hydrates from an async adapter once it resolves', async () => {
    const adapter: PersistAdapter = {
      read: () => Promise.resolve({ v: 1, state: { a: 'async' }, versions: { a: [4, 'x'] } }),
      write: () => {},
    };
    const s = createSharedStore<Shape>(
      'p-async',
      {},
      {
        transport: () => hub.connect(),
        persist: { adapter },
      },
    );

    expect(s.getSnapshot()['a']).toBeUndefined(); // not yet
    await vi.advanceTimersByTimeAsync(0);

    expect(s.getSnapshot()['a']).toBe('async');
    s.close();
  });

  it('starts empty when there is nothing stored', () => {
    const s = store('p-empty', webStorageAdapter(fakeStorage().storage, 'k'));

    expect(s.getSnapshot()).toEqual({});
    s.close();
  });

  it('exposes referentially stable versions', () => {
    const s = store('p-stable', webStorageAdapter(fakeStorage().storage, 'k'));
    const first = s.getVersions();

    expect(s.getVersions()).toBe(first); // no churn for useSyncExternalStore

    s.set('a', 1);
    expect(s.getVersions()).not.toBe(first);
    expect(s.getVersions()['a']).toEqual([1, s.clientId]);

    s.close();
  });
});

describe('webStorageAdapter onError', () => {
  it('reports a full quota on write, still without throwing', () => {
    const onError = vi.fn();
    const quota = new Error('QuotaExceededError');
    const adapter = webStorageAdapter(
      {
        getItem: () => null,
        setItem: () => {
          throw quota;
        },
        removeItem: () => {},
      },
      'k',
      { onError },
    );

    expect(() => adapter.write({ v: 1, state: {}, versions: {} })).not.toThrow();
    expect(onError).toHaveBeenCalledWith(quota, 'write');
  });

  it('reports corrupt JSON on read and a failing removeItem on remove', () => {
    const onError = vi.fn();
    const gone = new Error('gone');
    const adapter = webStorageAdapter(
      {
        getItem: () => '{not json',
        setItem: () => {},
        removeItem: () => {
          throw gone;
        },
      },
      'k',
      { onError },
    );

    expect(adapter.read()).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError), 'read');

    adapter.remove?.();
    expect(onError).toHaveBeenCalledWith(gone, 'remove');
  });

  it('reports blocked storage with the operation that hit it', () => {
    const onError = vi.fn();
    const security = new Error('SecurityError');
    const adapter = webStorageAdapter(
      () => {
        throw security;
      },
      'k',
      { onError },
    );

    expect(adapter.read()).toBeUndefined();
    expect(() => adapter.write({ v: 1, state: {}, versions: {} })).not.toThrow();
    expect(onError).toHaveBeenNthCalledWith(1, security, 'read');
    expect(onError).toHaveBeenNthCalledWith(2, security, 'write');
  });

  it('a throwing onError callback is contained — persistence stays best-effort', () => {
    const adapter = webStorageAdapter(
      () => {
        throw new Error('SecurityError');
      },
      'k',
      {
        onError: () => {
          throw new Error('observer bug');
        },
      },
    );

    expect(adapter.read()).toBeUndefined();
    expect(() => adapter.write({ v: 1, state: {}, versions: {} })).not.toThrow();
  });
});
