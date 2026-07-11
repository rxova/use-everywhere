import { getBus } from './bus.js';
import { newer } from './clock.js';
import type { CommonOptions, MessageMeta, Version } from './types.js';

export interface SharedStore<S extends Record<string, unknown>> {
  readonly clientId: string;
  /** Live proxy for imperative use: `store.state.count++` syncs everywhere. */
  readonly state: S;
  /** Immutable snapshot, replaced whenever a change is applied. Safe for useSyncExternalStore. */
  getSnapshot(): Readonly<S>;
  set<K extends keyof S & string>(key: K, value: S[K] | ((prev: S[K]) => S[K])): void;
  subscribe(fn: (key: keyof S & string, value: unknown, meta: MessageMeta) => void): () => void;
  subscribeKey(key: keyof S & string, fn: () => void): () => void;
  /**
   * Register a key lazily at version [0, clientId] — any patch or snapshot a
   * peer has already made for it wins over the initial value. No-op if the
   * key already exists.
   */
  registerKey<K extends keyof S & string>(key: K, initial: S[K]): void;
  close(): void;
}

/**
 * State synced across every same-origin tab/window/worker: per-key
 * last-writer-wins version clocks and a hello/snapshot late-joiner handshake.
 * Create at most one store per name per tab (the React package memoizes).
 */
export function createSharedStore<S extends Record<string, unknown>>(
  name: string,
  initial: S,
  options: CommonOptions = {},
): SharedStore<S> {
  const bus = getBus(name, options);
  const clientId = bus.clientId;

  const state: Record<string, unknown> = { ...initial };
  const versions: Record<string, Version> = {};
  for (const k in state) versions[k] = [0, clientId];
  let snapshot: Readonly<S> = Object.freeze({ ...state }) as S;

  const listeners = new Set<(key: keyof S & string, value: unknown, meta: MessageMeta) => void>();
  const keyListeners = new Map<string, Set<() => void>>();

  function notify(key: string, value: unknown, meta: MessageMeta) {
    snapshot = Object.freeze({ ...state }) as S;
    for (const fn of listeners) fn(key as keyof S & string, value, meta);
    const set = keyListeners.get(key);
    if (set) for (const fn of set) fn();
  }

  function applyRemote(key: string, value: unknown, version: Version, meta: MessageMeta) {
    if (!newer(version, versions[key])) return;
    versions[key] = version;
    state[key] = value;
    notify(key, value, meta);
  }

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'state') return;
    const meta: MessageMeta = { clientId: wire.clientId, kind: wire.kind, self: false };
    if (wire.type === 'patch') {
      applyRemote(wire.key, wire.value, wire.version, meta);
    } else if (wire.type === 'hello') {
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
    } else if (wire.type === 'snapshot') {
      for (const k in wire.state) {
        const version = wire.versions[k];
        if (version) applyRemote(k, wire.state[k], version, meta);
      }
    }
  });

  function setKey(key: string, value: unknown) {
    const version: Version = [(versions[key]?.[0] ?? 0) + 1, clientId];
    versions[key] = version;
    state[key] = value;
    bus.post({ v: 1, scope: 'state', type: 'patch', key, value, version, clientId, kind: bus.kind });
    notify(key, value, { clientId, kind: bus.kind, self: true });
  }

  const proxy = new Proxy(state, {
    set(_target, key, value) {
      if (typeof key !== 'string') return false;
      setKey(key, value);
      return true;
    },
  }) as S;

  // Late-joiner handshake: ask everyone for their state.
  bus.post({ v: 1, scope: 'state', type: 'hello', clientId, kind: bus.kind });

  return {
    clientId,
    state: proxy,
    getSnapshot: () => snapshot,
    set(key, value) {
      const next =
        typeof value === 'function'
          ? (value as (prev: unknown) => unknown)(state[key])
          : value;
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
      return () => set!.delete(fn);
    },
    registerKey(key, initialValue) {
      if (key in versions) return;
      versions[key] = [0, clientId];
      state[key] = initialValue;
      snapshot = Object.freeze({ ...state }) as S;
    },
    close() {
      unsubscribe();
      listeners.clear();
      keyListeners.clear();
      bus.release();
    },
  };
}
