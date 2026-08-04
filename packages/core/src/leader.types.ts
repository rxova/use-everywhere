import type { CommonOptions } from './common.types.js';

/**
 * Deliberately extends CommonOptions, not BusOptions: `heartbeatMs` here means
 * the leader's re-announce interval, which is a different thing from the bus's
 * presence ping. See the note in leader.ts about forwarding to getBus.
 */
/**
 * How the seat is arbitrated.
 *
 * - `'web-locks'` — the browser's Web Locks API owns the queue. The lock is
 *   released by the browser itself when a tab dies, and holding it does not
 *   depend on a timer, so a backgrounded tab cannot be deposed for being
 *   throttled. No heartbeat traffic at all.
 * - `'heartbeat'` — lease-and-claim over the bus. Works anywhere, including
 *   plain-http origins where `navigator.locks` does not exist.
 * - `'auto'` (default) — Web Locks when available, heartbeat otherwise.
 */
export type LeaderStrategy = 'auto' | 'web-locks' | 'heartbeat';

export interface LeaderOptions extends CommonOptions {
  /** How often the leader re-announces itself, in ms. Default 1000. Heartbeat strategy only. */
  heartbeatMs?: number;
  /** How long a follower tolerates silence before calling the seat empty, in ms. Default 3000. Heartbeat strategy only. */
  leaseMs?: number;
  /** May this client hold the leadership? Default true. */
  eligible?: boolean;
  /** How to arbitrate the seat. Default 'auto'. */
  strategy?: LeaderStrategy;
  /**
   * The Web Locks manager to elect on. Defaults to `navigator.locks`.
   *
   * A test seam: `@use-everywhere/test-utils` passes a `FakeLockManager` here
   * so several simulated tabs can queue on one seat — and so a crashed tab's
   * lock is reclaimed — in a plain test process.
   */
  locks?: LockManagerLike;
}

/** The slice of the Web Locks API this library uses. */
export interface LockManagerLike {
  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void>;
}

export interface LeaderSnapshot {
  /** The current leader's clientId, or null while the seat is empty. */
  readonly leaderId: string | null;
  readonly isLeader: boolean;
}

export interface Leader {
  readonly clientId: string;
  /** Which mechanism arbitrates this seat — useful in devtools and bug reports. */
  readonly strategy: Exclude<LeaderStrategy, 'auto'>;
  /** Frozen; a new object only when the leader actually changes. */
  getSnapshot(): LeaderSnapshot;
  subscribe(fn: () => void): () => void;
  /**
   * Resolves the moment this client holds the seat, or immediately if it
   * already does. Rejects if the leader is closed while still waiting — so an
   * `await` in a torn-down tab does not hang forever.
   */
  waitForLeadership(): Promise<void>;
  /** Give up the seat now. Peers take over immediately rather than waiting for the lease. */
  resign(): void;
  /** Turn candidacy on or off. Eligibility is a property of the tab, not a component. */
  setEligible(eligible: boolean): void;
  close(): void;
}
