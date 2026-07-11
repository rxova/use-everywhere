import { getBus } from './bus.js';
import { newer } from './clock.js';
import type { MessageMeta, Version } from './common.types.js';
import type { SharedStore, SharedStoreOptions } from './shared-store.types.js';

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
  const bus = getBus(name, options);
  const clientId = bus.clientId;
  const accept = options.accept;

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
    versions[key] = version;
    state[key] = value;
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
      return () => set.delete(fn);
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
