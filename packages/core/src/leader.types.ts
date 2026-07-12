import type { CommonOptions } from './common.types.js';

/**
 * Deliberately extends CommonOptions, not BusOptions: `heartbeatMs` here means
 * the leader's re-announce interval, which is a different thing from the bus's
 * presence ping. See the note in leader.ts about forwarding to getBus.
 */
export interface LeaderOptions extends CommonOptions {
  /** How often the leader re-announces itself, in ms. Default 1000. */
  heartbeatMs?: number;
  /** How long a follower tolerates silence before calling the seat empty, in ms. Default 3000. */
  leaseMs?: number;
  /** May this client hold the leadership? Default true. */
  eligible?: boolean;
}

export interface LeaderSnapshot {
  /** The current leader's clientId, or null while the seat is empty. */
  readonly leaderId: string | null;
  readonly isLeader: boolean;
}

export interface Leader {
  readonly clientId: string;
  /** Frozen; a new object only when the leader actually changes. */
  getSnapshot(): LeaderSnapshot;
  subscribe(fn: () => void): () => void;
  /** Give up the seat now. Peers take over immediately rather than waiting for the lease. */
  resign(): void;
  /** Turn candidacy on or off. Eligibility is a property of the tab, not a component. */
  setEligible(eligible: boolean): void;
  close(): void;
}
