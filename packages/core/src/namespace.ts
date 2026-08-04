import { createChannel } from './channel.js';
import type { Channel, ChannelOptions } from './channel.types.js';
import type { MessageMap } from './common.types.js';
import { DEFAULT_NAME } from './defaults.js';
import { createLeader } from './leader.js';
import type { Leader, LeaderOptions } from './leader.types.js';
import { createPresence } from './presence.js';
import type { Presence, PresenceOptions } from './presence.types.js';
import { createSharedStore } from './shared-store.js';
import type { SharedStore, SharedStoreOptions } from './shared-store.types.js';

/**
 * Separates a namespace from the name inside it.
 *
 * A colon rather than a slash or a dot: bus names end up in `BroadcastChannel`
 * names, `localStorage` keys and devtools labels, and a colon is the one common
 * separator none of those treat as structure. It is also what everyone already
 * types when they prefix names by hand, which is the convention this replaces.
 */
const SEPARATOR = ':';

/**
 * Everything a namespace makes, with the prefix already applied.
 *
 * The same signatures as the bare factories, minus nothing — a namespace is a
 * naming decision, not a reduced API.
 */
export interface Namespace {
  /** The prefix every name from this namespace carries. */
  readonly name: string;
  /** What a bare name becomes here. Exposed so devtools, `observeBus` and tests can name the same bus. */
  busName(name?: string): string;
  createSharedStore<S extends Record<string, unknown>>(
    name: string | undefined,
    initial: S,
    options?: SharedStoreOptions<S>,
  ): SharedStore<S>;
  createChannel<M extends MessageMap>(name?: string, options?: ChannelOptions<M>): Channel<M>;
  createPresence(name?: string, options?: PresenceOptions): Presence;
  createLeader(name?: string, options?: LeaderOptions): Leader;
}

/**
 * Namespaced factories, so two independently deployed apps on one origin cannot
 * collide by both taking the defaults.
 *
 * Bare names are the problem this solves. A `BroadcastChannel` is global to the
 * origin, so a name *is* an identity — and two micro-frontends that each call
 * `createSharedStore('cart', …)`, or each omit the name and land on
 * {@link DEFAULT_NAME}, are not two carts. They are one cart, with two teams
 * writing to it, one leader seat contended between them, and one presence roster
 * counting both. Nothing warns, because from the library's side it looks exactly
 * like the intended case of two tabs sharing state.
 *
 * "Prefix your names" is the workaround, and it fails the way conventions fail:
 * silently, once, in whichever app forgot.
 *
 * ```ts
 * const checkout = createNamespace('checkout');
 * const cart = checkout.createSharedStore('cart', { items: [] }); // bus "checkout:cart"
 * const events = checkout.createChannel('events');               // bus "checkout:events"
 * ```
 *
 * ## What it is not
 *
 * Not a security boundary. Everything here is same-origin and a namespace is a
 * string, so anything on the page can construct the same one deliberately. It
 * prevents collision, not access — see the security model docs.
 *
 * Not related to `wire.scope`, which says *which engine* a wire belongs to, or
 * to the React package's share scope, which says *how far* a value travels.
 * Three different axes; this is the one about names.
 */
export function createNamespace(namespace: string): Namespace {
  if (!namespace) {
    throw new TypeError(
      'use-everywhere: createNamespace() needs a non-empty name — an empty one would put every bus back on the shared defaults, which is what it exists to prevent.',
    );
  }
  const busName = (name: string = DEFAULT_NAME) => `${namespace}${SEPARATOR}${name}`;
  return {
    name: namespace,
    busName,
    createSharedStore: (name, initial, options) =>
      createSharedStore(busName(name), initial, options),
    createChannel: (name, options) => createChannel(busName(name), options),
    createPresence: (name, options) => createPresence(busName(name), options),
    createLeader: (name, options) => createLeader(busName(name), options),
  };
}
