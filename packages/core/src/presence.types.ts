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
  /**
   * What to tell peers about this client — a display name, a tab title, a
   * cursor. Must survive the wire (structured clone), like any payload.
   */
  metadata?: unknown;
  /**
   * Put this client in its own roster. Default false.
   *
   * The default answers "who *else* is here", which is what a presence strip
   * asks. Turn it on for an avatar list, where leaving yourself out means
   * every tab renders a different list of the same room.
   */
  includeSelf?: boolean;
}

export interface Presence {
  readonly clientId: string;
  /** Stable array snapshot (replaced on change) — safe for useSyncExternalStore. */
  getPeers(): readonly Peer[];
  /**
   * Publish new metadata for this client, announcing it to peers.
   *
   * A no-op when the value has not actually changed, so calling it on every
   * render — which is what a hook does — costs nothing and announces nothing.
   */
  setMetadata(metadata: unknown): void;
  subscribe(fn: () => void): () => void;
  close(): void;
}
