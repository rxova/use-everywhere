import {
  createChannel,
  createLeader,
  createPresence,
  createSharedReducer,
  createSharedStore,
  DEFAULT_NAME,
  NoopTransport,
  type Channel,
  type ChannelOptions,
  type Leader,
  type LeaderOptions,
  type MessageMap,
  type Presence,
  type ReplyMap,
  type SharedReducer,
  type SharedStoreOptions,
} from '@use-everywhere/core';
import { devWarn } from './dev.js';
import type { AnyStore } from './registry.types.js';
import {
  createServerChannel,
  createServerLeader,
  createServerReducer,
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
 * createStoreHooks at module scope and consumed by getStore on creation — which is
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
  // `version` is part of the signature and `migrate` is not, for the same
  // reason as the adapter: a hot edit rebuilds the function, but changing the
  // *version* is a deliberate statement that the store would be built
  // differently — and one worth being told about if it comes too late.
  return `persist:${persist.keys?.join(',') ?? '*'}:${persist.debounceMs ?? 'default'}:v${persist.version ?? 0}`;
}

export function configureStore(name: string, scope: ShareScope, options: SharedStoreOptions): void {
  const key = `${scope} ${name}`;
  if (stores.has(key)) {
    // Re-registering the same configuration is what Fast Refresh does on every
    // edit to the defining module. Throwing there — as this used to — broke dev
    // on a change that alters nothing, so an identical redefinition is a no-op
    // and only a genuine conflict is reported.
    if (configSignature(storeConfig.get(key)) === configSignature(options)) return;
    if (process.env.NODE_ENV !== 'production') {
      devWarn(
        'UE2002',
        `createStoreHooks('${name}') ran after that store was already created, with different options. ` +
          'The live store keeps the configuration it was built with. Move createStoreHooks to module scope, ' +
          'before any component reads the store.',
      );
    }
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

/**
 * One Presence per name per tab.
 *
 * `includeSelf` is part of the key rather than the options, because it changes
 * what the roster *is*: two components on one name disagreeing about it would
 * otherwise silently get whichever answer was built first.
 */
export function getPresence(name: string, includeSelf = false): Presence {
  const key = includeSelf ? `self ${name}` : name;
  let presence = presences.get(key);
  if (!presence) {
    presence = isServer() ? createServerPresence() : createPresence(name, { includeSelf });
    presences.set(key, presence);
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
      if (process.env.NODE_ENV !== 'production') {
        devWarn(
          'UE2003',
          `leader "${name}": ${key} ignored — the first useLeader/getLeader call fixes the election timings for this tab.`,
        );
      }
    }
  }
}

/**
 * Options to build a channel with when it is first needed. Registered by
 * defineChannel at module scope and consumed by getChannel on creation — the
 * same deferral createStoreHooks uses, so declaring a schema constructs nothing on
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
    if (process.env.NODE_ENV !== 'production') {
      devWarn(
        'UE2004',
        `defineChannel('${name}') ran after that channel was already created, with different options. ` +
          'The live channel keeps the configuration it was built with. Move defineChannel to module scope, ' +
          'before any component sends or receives on it.',
      );
    }
    return;
  }
  channelConfig.set(name, options as ChannelOptions<MessageMap>);
}

const reducers = new Map<string, SharedReducer<unknown, unknown>>();

/**
 * One reducer per name+key per tab, like every other engine here.
 *
 * The reducer is handed this tab's existing `Leader` rather than electing its
 * own: the leader is the sequencer, and a page that already has a seat for this
 * bus must not run a second election to get another one.
 *
 * The first caller's reducer function wins. A hook re-renders with a new
 * function identity every time, and swapping the fold under a history that has
 * already been applied would give this tab a different answer from its peers —
 * which is the one thing an ordered reducer exists to prevent.
 */
export function getReducer<S, A>(
  name: string,
  key: string,
  reducer: (state: S, action: A) => S,
  initial: S,
): SharedReducer<S, A> {
  const id = `${name} ${key}`;
  let existing = reducers.get(id);
  if (!existing) {
    existing = (
      isServer()
        ? createServerReducer(initial)
        : createSharedReducer(name, reducer, initial, { key, leader: getLeader(name) })
    ) as SharedReducer<unknown, unknown>;
    reducers.set(id, existing);
  }
  return existing as unknown as SharedReducer<S, A>;
}

export function getChannel<M extends MessageMap, R extends ReplyMap<M> = Record<never, never>>(
  name: string,
): Channel<M, R> {
  let channel = channels.get(name);
  if (!channel) {
    channel = isServer() ? createServerChannel(name) : createChannel(name, channelConfig.get(name));
    channels.set(name, channel);
  }
  return channel as unknown as Channel<M, R>;
}
