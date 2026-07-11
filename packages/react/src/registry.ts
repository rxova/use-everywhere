import {
  createChannel,
  createPresence,
  createSharedStore,
  type Channel,
  type MessageMap,
  type Presence,
  type SharedStore,
} from '@use-everywhere/core';

/**
 * A BroadcastChannel is already global to the origin — identity is the name
 * string, not the React tree — so hooks share module-level singletons per
 * name instead of requiring a Provider. Instances live for the page lifetime.
 */
export const DEFAULT_NAME = 'use-everywhere';

type AnyStore = SharedStore<Record<string, unknown>>;

const stores = new Map<string, AnyStore>();
const presences = new Map<string, Presence>();
const channels = new Map<string, Channel<MessageMap>>();

export function getStore(name: string): AnyStore {
  let store = stores.get(name);
  if (!store) {
    store = createSharedStore(name, {});
    stores.set(name, store);
  }
  return store;
}

export function getPresence(name: string): Presence {
  let presence = presences.get(name);
  if (!presence) {
    presence = createPresence(name);
    presences.set(name, presence);
  }
  return presence;
}

export function getChannel<M extends MessageMap>(name: string): Channel<M> {
  let channel = channels.get(name);
  if (!channel) {
    channel = createChannel(name);
    channels.set(name, channel);
  }
  return channel as Channel<M>;
}
