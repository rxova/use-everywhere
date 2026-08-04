import {
  createChannel,
  createLeader,
  createPresence,
  createSharedStore,
  DEFAULT_NAME,
  NoopTransport,
  type Channel,
  type ChannelOptions,
  type Leader,
  type LeaderOptions,
  type MessageMap,
  type Presence,
  type SharedStoreOptions,
} from '@use-everywhere/core';
import { devWarn } from './dev.js';
import type { AnyStore } from './registry.types.js';
import {
  createServerChannel,
  createServerLeader,
  createServerPresence,
  createServerStore,
} from './server-stubs.js';
import type { ShareScope } from './use-shared-state.types.js';

/**
 * A BroadcastChannel is already global to the origin — identity is the name
 * string, not the React tree — so hooks share module-level singletons per
 * name instead of requiring a Provider. Instances live for the page lifetime.
 */
export { DEFAULT_NAME };

const stores = new Map<string, AnyStore>();
const presences = new Map<string, Presence>();
const channels = new Map<string, Channel<MessageMap>>();
const leaders = new Map<string, Leader>();
const storeConfig = new Map<string, SharedStoreOptions>();

/**
 * Checked per call, not captured once: a module evaluated during SSR and a
 * module evaluated in the browser are different module instances, so there is
 * no cache to invalidate — but reading it lazily keeps the bundler from
 * folding the branch away in a build that serves both.
 */
const isServer = () => typeof window === 'undefined';

/** Per-scope store creation: what leaves this tab and what is let back in. */
const scopeOptions: Record<ShareScope, SharedStoreOptions> = {
  everywhere: {},
  tabs: { accept: (meta) => meta.kind !== 'worker' },
  tab: { transport: () => new NoopTransport() },
};

/** Imperative access to the store behind useSharedState (patch logs, non-React code). */
export function getSharedStore(
  name: string = DEFAULT_NAME,
  scope: ShareScope = 'everywhere',
): AnyStore {
  return getStore(name, scope);
}

/**
 * Options to build a store with when it is first needed. Registered by
 * defineStore at module scope and consumed by getStore on creation — which is
 * what lets persistence be declared in one place without constructing anything
 * on import.
 */
/**
 * A configuration's shape, ignoring the adapter's identity. Hot Module
 * Replacement re-evaluates the defining module and builds a *new* adapter
 * object each time, so identity comparison would call every hot edit a
 * conflict; what actually matters is whether the store would be built
 * differently.
 */
function configSignature(options: SharedStoreOptions | undefined): string {
  const persist = options?.persist;
  if (!persist) return 'none';
  return `persist:${persist.keys?.join(',') ?? '*'}:${persist.debounceMs ?? 'default'}`;
}

export function configureStore(name: string, scope: ShareScope, options: SharedStoreOptions): void {
  const key = `${scope} ${name}`;
  if (stores.has(key)) {
    // Re-registering the same configuration is what Fast Refresh does on every
    // edit to the defining module. Throwing there — as this used to — broke dev
    // on a change that alters nothing, so an identical redefinition is a no-op
    // and only a genuine conflict is reported.
    if (configSignature(storeConfig.get(key)) === configSignature(options)) return;
    devWarn(
      `[use-everywhere] defineStore('${name}') ran after that store was already created, with different options. ` +
        'The live store keeps the configuration it was built with. Move defineStore to module scope, ' +
        'before any component reads the store.',
    );
    return;
  }
  storeConfig.set(key, options);
}

export function getStore(name: string, scope: ShareScope = 'everywhere'): AnyStore {
  const key = `${scope} ${name}`;
  let store = stores.get(key);
  if (!store) {
    store = isServer()
      ? createServerStore()
      : createSharedStore(name, {}, { ...scopeOptions[scope], ...storeConfig.get(key) });
    stores.set(key, store);
  }
  return store;
}

export function getPresence(name: string): Presence {
  let presence = presences.get(name);
  if (!presence) {
    presence = isServer() ? createServerPresence() : createPresence(name);
    presences.set(name, presence);
  }
  return presence;
}

/**
 * One Leader per name per tab. Eligibility is deliberately *not* part of the
 * key: two Leaders on one name would share a bus and a clientId, and since a
 * post never loops back locally, neither would ever see the other's claims.
 * Timing options are first-wins, like every other engine here.
 */
export function getLeader(name: string, options?: LeaderOptions): Leader {
  let leader = leaders.get(name);
  if (!leader) {
    leader = isServer() ? createServerLeader() : createLeader(name, options);
    leaders.set(name, leader);
    if (options) leaderOptions.set(name, options);
  } else if (options) {
    warnOnLeaderOptionConflict(name, options);
  }
  return leader;
}

/** What the first caller elected with, so a later caller asking for different timings can be told it was ignored. */
const leaderOptions = new Map<string, LeaderOptions>();

function warnOnLeaderOptionConflict(name: string, options: LeaderOptions): void {
  const first = leaderOptions.get(name);
  for (const key of ['heartbeatMs', 'leaseMs'] as const) {
    const requested = options[key];
    if (requested !== undefined && requested !== first?.[key]) {
      devWarn(
        `[use-everywhere] leader "${name}": ${key} ignored — the first useLeader/getLeader call fixes the election timings for this tab.`,
      );
    }
  }
}

/**
 * Options to build a channel with when it is first needed. Registered by
 * defineChannel at module scope and consumed by getChannel on creation — the
 * same deferral defineStore uses, so declaring a schema constructs nothing on
 * import.
 */
const channelConfig = new Map<string, ChannelOptions<MessageMap>>();

export function configureChannel<M extends MessageMap>(
  name: string,
  options: ChannelOptions<M>,
): void {
  if (channels.has(name)) {
    // Fast Refresh re-runs the defining module on every edit, rebuilding the
    // schema objects each time, so identity comparison would call a no-op edit
    // a conflict. Which keys are validated is what would actually build a
    // different channel.
    const before = Object.keys(channelConfig.get(name)?.schema ?? {}).sort();
    const after = Object.keys(options.schema ?? {}).sort();
    if (before.join() === after.join()) return;
    devWarn(
      `[use-everywhere] defineChannel('${name}') ran after that channel was already created, with different options. ` +
        'The live channel keeps the configuration it was built with. Move defineChannel to module scope, ' +
        'before any component sends or receives on it.',
    );
    return;
  }
  channelConfig.set(name, options as ChannelOptions<MessageMap>);
}

export function getChannel<M extends MessageMap>(name: string): Channel<M> {
  let channel = channels.get(name);
  if (!channel) {
    channel = isServer() ? createServerChannel(name) : createChannel(name, channelConfig.get(name));
    channels.set(name, channel);
  }
  return channel as Channel<M>;
}
