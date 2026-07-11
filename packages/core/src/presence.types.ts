import type { BusOptions } from './bus.types.js';
import type { Peer } from './common.types.js';

export interface PresenceOptions extends BusOptions {
  /** Peers silent for longer than this are dropped. Default 5000ms. */
  pruneAfterMs?: number;
}

export interface Presence {
  readonly clientId: string;
  /** Stable array snapshot (replaced on change) — safe for useSyncExternalStore. */
  getPeers(): readonly Peer[];
  subscribe(fn: () => void): () => void;
  close(): void;
}
