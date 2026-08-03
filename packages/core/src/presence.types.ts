import type { BusOptions } from './bus.types.js';
import type { Peer } from './common.types.js';

export interface PresenceOptions extends BusOptions {
  /** How much silence makes a peer suspect. Default 5000ms. It is then probed, not dropped. */
  pruneAfterMs?: number;
  /**
   * How long a probed peer has to answer before it is dropped. Default 1000ms.
   *
   * This is a round trip on a same-origin channel, not a heartbeat interval, so
   * it can be short: a peer that is merely throttled still answers at once.
   */
  probeGraceMs?: number;
}

export interface Presence {
  readonly clientId: string;
  /** Stable array snapshot (replaced on change) — safe for useSyncExternalStore. */
  getPeers(): readonly Peer[];
  subscribe(fn: () => void): () => void;
  close(): void;
}
