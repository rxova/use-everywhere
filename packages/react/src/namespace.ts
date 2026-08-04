import {
  createNamespace as createCoreNamespace,
  type MessageMap,
  type Namespace as CoreNamespace,
} from '@use-everywhere/core';
import { defineChannel } from './define-channel.js';
import type { ChannelHooks } from './define-channel.types.js';
import { defineStore } from './define-store.js';
import type { DefineStoreOptions, StoreHooks } from './define-store.types.js';
import type { ChannelOptions } from '@use-everywhere/core';
import { getSharedStore } from './registry.js';
import type { AnyStore } from './registry.types.js';
import { useHydrated } from './use-hydrated.js';
import { useClientId, usePeers } from './use-peers.js';
import { useIsLeader, useLeader, useLeaderEffect } from './use-leader.js';
import type { UseLeaderOptions } from './use-leader.types.js';
import { useSharedState } from './use-shared-state.js';
import type { UseSharedStateOptions } from './use-shared-state.types.js';
import type { Peer, LeaderSnapshot } from '@use-everywhere/core';

/**
 * The React half of a namespace: the same hooks, with every bus name prefixed.
 *
 * Options keep their meaning — `store` and `name` are still relative names, and
 * `scope` still says how far a value travels, which is a different axis from
 * which namespace it lives in.
 */
export interface ReactNamespace extends CoreNamespace {
  defineStore<S extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    options?: DefineStoreOptions,
  ): StoreHooks<S>;
  defineChannel<M extends MessageMap>(name?: string, options?: ChannelOptions<M>): ChannelHooks<M>;
  getSharedStore(name?: string, scope?: UseSharedStateOptions['scope']): AnyStore;
  useSharedState<T>(
    key: string,
    initial: T,
    options?: UseSharedStateOptions,
  ): [T, (next: T | ((prev: T) => T)) => void];
  usePeers(options?: { name?: string }): readonly Peer[];
  useHydrated(options?: UseSharedStateOptions): boolean;
  useClientId(options?: { name?: string }): string;
  useLeader(options?: UseLeaderOptions): LeaderSnapshot;
  useIsLeader(options?: UseLeaderOptions): boolean;
  useLeaderEffect(effect: () => void | (() => void), options?: UseLeaderOptions): void;
}

/**
 * Namespaced hooks and factories, so two independently deployed apps on one
 * origin cannot collide by both taking the defaults.
 *
 * ```ts
 * // checkout/bus.ts
 * export const checkout = createNamespace('checkout');
 *
 * // anywhere in the checkout app
 * const [items, setItems] = checkout.useSharedState('items', []);
 * ```
 *
 * Call it **at module scope**, like `defineStore` and `defineChannel`. It
 * builds a small object of bound functions, and rebuilding that on every render
 * would hand React a new `useSharedState` identity each time — harmless for the
 * hooks themselves, which key off the bus name, but pointless work and a
 * confusing thing to see in a profile.
 *
 * See the core `createNamespace` for what a namespace does and does not
 * guarantee. In short: it prevents collision, not access.
 */
export function createNamespace(namespace: string): ReactNamespace {
  const core = createCoreNamespace(namespace);
  const { busName } = core;

  return {
    ...core,
    defineStore: (name, options) => defineStore(busName(name), options),
    defineChannel: (name, options) => defineChannel(busName(name), options),
    getSharedStore: (name, scope) => getSharedStore(busName(name), scope),
    useSharedState: (key, initial, options) =>
      useSharedState(key, initial, { ...options, store: busName(options?.store) }),
    usePeers: (options) => usePeers({ name: busName(options?.name) }),
    useHydrated: (options) => useHydrated({ ...options, store: busName(options?.store) }),
    useClientId: (options) => useClientId({ name: busName(options?.name) }),
    useLeader: (options) => useLeader({ ...options, name: busName(options?.name) }),
    useIsLeader: (options) => useIsLeader({ ...options, name: busName(options?.name) }),
    useLeaderEffect: (effect, options) =>
      useLeaderEffect(effect, { ...options, name: busName(options?.name) }),
  };
}
