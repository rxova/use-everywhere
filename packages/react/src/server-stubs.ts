import type { Channel, Leader, MessageMap, Presence } from '@use-everywhere/core';
import type { AnyStore } from './registry.types.js';

/**
 * On a server there is no BroadcastChannel, no other tab, and no way to change
 * a value between the render and the response — but the real engines still
 * open transports, arm presence heartbeats, and (for the leader) run an
 * election on `setInterval`s that nothing ever clears. In a long-lived Next.js
 * process that is one leaked interval per name, per process, forever.
 *
 * So the registry hands back these inert doubles instead. They satisfy the
 * interfaces, never schedule anything, and never mutate: `useSyncExternalStore`
 * asks for a server snapshot, gets a frozen constant, and renders. The real
 * engines are constructed on the client, on first use, as before.
 */

/**
 * Deliberately blank rather than random: it is rendered by `useClientId`, and a
 * value the server invents can never match the one the client mints, which is
 * a guaranteed hydration mismatch.
 */
export const SERVER_CLIENT_ID = '';

const EMPTY = Object.freeze({});
// A constant, not a fresh `[]` per call: these are read through
// useSyncExternalStore, which re-renders forever if a snapshot getter returns a
// new reference each time it is asked.
const NO_PEERS = Object.freeze([]);
const noop = () => {};
const unsubscribe = () => noop;

/**
 * One frozen object serving as store, presence and leader. Their surfaces do
 * not collide, and a server render never distinguishes two inert engines by
 * identity — so this is a single shared constant rather than three allocations
 * in every bundle that imports a hook.
 */
const INERT = Object.freeze({
  clientId: SERVER_CLIENT_ID,
  // store
  state: EMPTY,
  getVersions: () => EMPTY,
  set: noop,
  subscribeKey: unsubscribe,
  registerKey: noop,
  // store + leader share getSnapshot; presence has getPeers
  getSnapshot: () => EMPTY,
  getPeers: () => NO_PEERS,
  // leader
  resign: noop,
  setEligible: noop,
  // common
  subscribe: unsubscribe,
  close: noop,
});

export const createServerStore = (): AnyStore => INERT as unknown as AnyStore;
export const createServerPresence = (): Presence => INERT as unknown as Presence;

/**
 * Leadership needs its own snapshot shape, so it wraps the shared constant.
 * `waitForLeadership` never settles on a server: there is no election to win,
 * and resolving would run leader-only work during a render that is about to be
 * thrown away. A pending promise is the honest answer.
 */
const NO_LEADER = Object.freeze({ leaderId: null, isLeader: false });
const NEVER = () => new Promise<void>(() => {});
export const createServerLeader = (): Leader =>
  ({
    ...INERT,
    strategy: 'heartbeat',
    getSnapshot: () => NO_LEADER,
    waitForLeadership: NEVER,
  }) as unknown as Leader;

/** Channels carry their name, so this is the one double that allocates. */
export const createServerChannel = <M extends MessageMap>(name: string): Channel<M> =>
  ({ ...INERT, name, post: noop, on: unsubscribe }) as unknown as Channel<M>;
