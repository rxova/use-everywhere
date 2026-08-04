import type {
  Channel,
  ChannelOptions,
  Leader,
  LeaderOptions,
  MessageMap,
  PeerKind,
  Presence,
  PresenceOptions,
  SharedReducer,
  SharedReducerOptions,
  SharedStore,
  SharedStoreOptions,
} from '@use-everywhere/core';
import type { MemoryHub } from '@use-everywhere/core/testing';
import type { FakeLockManager } from './fake-locks.js';

export interface ScenarioOptions {
  /**
   * How leadership is arbitrated in this simulated browser. Default
   * `'web-locks'`, matching every browser that has the API — and the only
   * strategy where a crashed tab's seat is reclaimed by the platform rather
   * than by a lease expiring.
   *
   * `'heartbeat'` runs the election that plain-http origins get. Test both if
   * your app ships to one.
   */
  election?: 'web-locks' | 'heartbeat';
}

export interface TabOptions {
  /** A label for this tab. Defaults to `tab-1`, `tab-2`, … */
  id?: string;
  /** What this client announces itself as. Defaults to `'tab'`. */
  kind?: PeerKind;
}

/**
 * A simulated tab: a lifecycle group over the primitives created through it.
 *
 * Each primitive gets its own connection to the hub — the same shape a real tab
 * has when it uses several bus names — so a presence and a store created on
 * *one* name in one tab announce themselves as two clients. One primitive per
 * name per tab, and the simulation matches a browser exactly.
 */
export interface Tab {
  readonly id: string;
  /** True once this tab has been closed or crashed. */
  readonly gone: boolean;

  store<S extends Record<string, unknown>>(
    name: string,
    initial: S,
    options?: SharedStoreOptions<S>,
  ): SharedStore<S>;
  reducer<S, A>(
    name: string,
    reducer: (state: S, action: A) => S,
    initial: S,
    options?: SharedReducerOptions,
  ): SharedReducer<S, A>;
  channel<M extends MessageMap>(name: string, options?: ChannelOptions<M>): Channel<M>;
  presence(name: string, options?: PresenceOptions): Presence;
  leader(name: string, options?: LeaderOptions): Leader;

  /**
   * Close this tab the way a user closes one: every primitive says goodbye,
   * peers drop it from the roster at once, and any lock it held is released.
   */
  close(): void;

  /**
   * Kill this tab the way a crash does: the wire is cut mid-sentence, no
   * goodbye is sent, and the locks it held are reclaimed by the platform.
   *
   * The difference from `close()` is the whole reason multi-tab code is hard —
   * peers have to *notice*, rather than being told.
   */
  crash(): void;
}

export interface Scenario {
  /** The in-memory bus every tab in this scenario is connected to. */
  readonly hub: MemoryHub;
  /** The Web Locks stand-in shared by every tab. */
  readonly locks: FakeLockManager;
  /** Every tab created, in order, including the ones that are gone. */
  readonly tabs: readonly Tab[];

  /** Open another tab. */
  tab(options?: TabOptions): Tab;

  /**
   * Let the wire catch up: drains microtasks, or waits `ms` when the thing you
   * are waiting for is on a timer (a snapshot window, a lease, a probe).
   */
  settle(ms?: number): Promise<void>;

  /** Close every tab that is still open. Safe to call twice. */
  dispose(): void;
}
