import type { CommonOptions } from './common.types.js';
import type { Leader, LeaderOptions } from './leader.types.js';

export interface SharedReducerOptions extends CommonOptions {
  /**
   * Which reducer this is, when several share a bus name. Default `'default'`.
   *
   * The same axis as a store key: one bus, many reducers, each ordered
   * independently of the others.
   */
  key?: string;
  /**
   * Reuse an existing leader rather than electing another. A reducer needs a
   * sequencer, and a page that already has a `Leader` for this bus should not
   * run a second election to get one.
   */
  leader?: Leader;
  /** Election settings, when this reducer elects its own leader. Ignored if `leader` is passed. */
  leaderOptions?: LeaderOptions;
}

export interface SharedReducer<S, A> {
  readonly clientId: string;
  /** Immutable, replaced whenever the value changes. Safe for useSyncExternalStore. */
  getSnapshot(): S;
  /**
   * Apply an action everywhere.
   *
   * Applied locally first so the UI does not wait for a round trip, then
   * proposed to the leader for ordering. If the committed order turns out to
   * differ from the optimistic one, the local value is rebuilt from the
   * committed state — so a dispatch can be *seen* out of order for a moment,
   * but never *settle* out of order.
   */
  dispatch(action: A): void;
  subscribe(fn: () => void): () => void;
  /**
   * Number of dispatches from this client that have not yet come back
   * committed. Zero means this client's view is entirely confirmed.
   */
  pendingCount(): number;
  close(): void;
}
