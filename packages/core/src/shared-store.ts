import { getBus } from './bus.js';
import { newer } from './clock.js';
import { devWarn } from './dev.js';
import { freezeShared } from './dev-freeze.js';
import type { MessageMeta, Version } from './common.types.js';
import type { Persisted } from './persist.types.js';
import type { SharedStore, SharedStoreOptions } from './shared-store.types.js';

// Live-store count per name on the shared (registry) bus, to catch the
// two-stores-one-name mistake. Custom transports are exempt: in tests every
// store is deliberately its own simulated client on the same name.
const liveStores = new Map<string, number>();

/**
 * State synced across every same-origin tab/window/worker: per-key
 * last-writer-wins version clocks and a hello/snapshot late-joiner handshake.
 * Create at most one store per name per tab (the React package memoizes).
 */
export function createSharedStore<S extends Record<string, unknown>>(
  name: string,
  initial: S,
  options: SharedStoreOptions = {},
): SharedStore<S> {
  const onSharedBus = !options.transport;
  if (onSharedBus) {
    const live = liveStores.get(name) ?? 0;
    if (live > 0) {
      devWarn(
        `[use-everywhere] second shared store for "${name}" in this tab — stores on one page never hear each other and will diverge. Reuse one per name.`,
      );
    }
    liveStores.set(name, live + 1);
  }
  const bus = getBus(name, options);
  const clientId = bus.clientId;
  const accept = options.accept;

  const state: Record<string, unknown> = { ...initial };
  const versions: Record<string, Version> = {};
  for (const k in state) {
    versions[k] = [0, clientId];
    freezeShared(state[k]); // dev-only: catch accidental in-place mutation early
  }
  let snapshot: Readonly<S> = Object.freeze({ ...state }) as S;
  let versionsSnapshot: Readonly<Record<string, Version>> = Object.freeze({ ...versions });

  const listeners = new Set<(key: keyof S & string, value: unknown, meta: MessageMeta) => void>();
  const keyListeners = new Map<string, Set<() => void>>();

  function notify(key: string, value: unknown, meta: MessageMeta) {
    snapshot = Object.freeze({ ...state }) as S;
    versionsSnapshot = Object.freeze({ ...versions });
    for (const fn of listeners) fn(key as keyof S & string, value, meta);
    const set = keyListeners.get(key);
    if (set) for (const fn of set) fn();
  }

  function applyRemote(key: string, value: unknown, version: Version, meta: MessageMeta) {
    if (!newer(version, versions[key])) return;
    versions[key] = version;
    state[key] = freezeShared(value);
    notify(key, value, meta);
  }

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'state') return;
    const meta: MessageMeta = { clientId: wire.clientId, kind: wire.kind, self: false };
    if (wire.type === 'hello') {
      // A late joiner arrived: answer with full state + versions.
      bus.post({
        v: 1,
        scope: 'state',
        type: 'snapshot',
        clientId,
        kind: bus.kind,
        state: { ...state },
        versions: { ...versions },
      });
      return;
    }
    if (accept && !accept(meta)) return;
    if (wire.type === 'patch') {
      applyRemote(wire.key, wire.value, wire.version, meta);
    } else {
      for (const k in wire.state) {
        const version = wire.versions[k];
        if (version) applyRemote(k, wire.state[k], version, meta);
      }
    }
  });

  function setKey(key: string, value: unknown) {
    const version: Version = [(versions[key]?.[0] ?? 0) + 1, clientId];
    // Post before committing locally: postMessage rejects non-cloneable values
    // (functions, DOM nodes, class instances) by throwing synchronously, and a
    // throw *after* the local write would leave this tab silently diverged
    // from every peer. Posting first makes the write all-or-nothing.
    try {
      bus.post({
        v: 1,
        scope: 'state',
        type: 'patch',
        key,
        value,
        version,
        clientId,
        kind: bus.kind,
      });
    } catch (error) {
      throw new TypeError(
        `use-everywhere: the value for key "${key}" cannot cross the wire (structured clone failed); the write was not applied. ${String(error)}`,
        { cause: error },
      );
    }
    versions[key] = version;
    state[key] = freezeShared(value);
    notify(key, value, { clientId, kind: bus.kind, self: true });
  }

  const proxy = new Proxy(state, {
    set(_target, key, value) {
      if (typeof key !== 'string') return false;
      setKey(key, value);
      return true;
    },
  }) as S;

  const persist = options.persist;
  let flushPersist: (() => void) | undefined;

  if (persist) {
    const { adapter, keys, debounceMs = 100 } = persist;
    const shouldPersist = (key: string) => !keys || keys.includes(key);

    const hydrate = (saved: Persisted | undefined) => {
      if (!saved) return;
      for (const key in saved.state) {
        const version = saved.versions[key];
        if (!version || !shouldPersist(key)) continue;
        // Through the same LWW gate as any remote write, so a live tab holding
        // something newer still wins. `accept` is deliberately bypassed: it
        // gates what other clients may tell us, and this is our own past.
        applyRemote(key, saved.state[key], version, { clientId, kind: bus.kind, self: true });
        // Re-broadcast, carrying the *persisted* version. Not an optimisation:
        // hello/snapshot only flows incumbent -> joiner, so a live tab sitting
        // on a staler value would never otherwise hear about the restored one,
        // and the two would diverge permanently. applyRemote gates on
        // wire.version and uses clientId only for meta, so this is legal.
        bus.post({
          v: 1,
          scope: 'state',
          type: 'patch',
          key,
          value: saved.state[key],
          version,
          clientId,
          kind: bus.kind,
        });
      }
    };

    const collect = (): Persisted => {
      const out: Persisted = { v: 1, state: {}, versions: {} };
      for (const key in versions) {
        const version = versions[key];
        // Counter 0 means "registered, never written" — somebody's `initial`,
        // not data. Persisting it would let a restored initial lose to another
        // tab's initial on the clientId tie-break, which is a silent
        // divergence. Everything we write has counter >= 1, so it strictly
        // beats any [0, *] that registerKey can mint.
        if (!version || version[0] === 0 || !shouldPersist(key)) continue;
        out.state[key] = state[key];
        out.versions[key] = version;
      }
      return out;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    flushPersist = () => {
      clearTimeout(timer);
      timer = undefined;
      void adapter.write(collect());
    };

    const saved = adapter.read();
    if (saved instanceof Promise) {
      void saved.then(hydrate);
    } else {
      hydrate(saved);
    }

    // Attached after hydration, or the restore would immediately re-persist
    // what it just read. Fires for local *and* remote writes, so every tab
    // keeps the converged state on disk.
    listeners.add(() => {
      if (timer !== undefined) return;
      timer = setTimeout(flushPersist as () => void, debounceMs);
    });

    if (typeof document !== 'undefined' && typeof addEventListener === 'function') {
      addEventListener('pagehide', flushPersist);
    }
  }

  const sayHello = () =>
    bus.post({ v: 1, scope: 'state', type: 'hello', clientId, kind: bus.kind });

  // A tab restored from bfcache missed every patch broadcast while it was
  // cached — with no re-handshake it would hold silently stale state until the
  // next write to each affected key. Re-run the late-joiner handshake: the
  // snapshot replies pass through the same LWW gate, so anything we hold that
  // is genuinely newer still survives.
  const onPageShow = (event: Event) => {
    if (!(event as { persisted?: boolean }).persisted) return;
    sayHello();
  };
  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  if (hasWindow) addEventListener('pageshow', onPageShow);

  // Late-joiner handshake: ask everyone for their state.
  sayHello();

  let storeClosed = false;
  return {
    clientId,
    state: proxy,
    getSnapshot: () => snapshot,
    getVersions: () => versionsSnapshot,
    set(key, value) {
      const next =
        typeof value === 'function' ? (value as (prev: unknown) => unknown)(state[key]) : value;
      setKey(key, next);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    subscribeKey(key, fn) {
      let set = keyListeners.get(key);
      if (!set) {
        set = new Set();
        keyListeners.set(key, set);
      }
      set.add(fn);
      return () => {
        set.delete(fn);
        // Drop the bucket with its last listener. Per-item keys
        // (`useSharedState(`row-${id}`)`) otherwise leave one empty Set per key
        // that ever mounted, for the life of the page.
        if (set.size === 0) keyListeners.delete(key);
      };
    },
    registerKey(key, initialValue) {
      // Guards on `versions`, not `state` — which is what makes hydration
      // win: it writes versions[key] during construction, strictly before any
      // hook can register the same key, so this is a no-op and the restored
      // value survives to first paint.
      if (key in versions) return;
      versions[key] = [0, clientId];
      state[key] = freezeShared(initialValue);
      snapshot = Object.freeze({ ...state }) as S;
      versionsSnapshot = Object.freeze({ ...versions });
    },
    close() {
      if (storeClosed) return;
      storeClosed = true;
      if (onSharedBus) {
        // Creation always registers the name, so the entry is present here.
        /* v8 ignore next */
        const live = (liveStores.get(name) ?? 1) - 1;
        if (live > 0) liveStores.set(name, live);
        else liveStores.delete(name);
      }
      if (hasWindow) removeEventListener('pageshow', onPageShow);
      if (flushPersist) {
        flushPersist();
        if (typeof document !== 'undefined' && typeof removeEventListener === 'function') {
          removeEventListener('pagehide', flushPersist);
        }
      }
      unsubscribe();
      listeners.clear();
      keyListeners.clear();
      bus.release();
    },
  };
}
