import type { CommonOptions, PeerKind, Version } from './common.types.js';

/** Everything on the same-origin bus, multiplexed by scope over one BroadcastChannel per name. */
export type BusWire =
  | {
      v: 1;
      scope: 'state';
      type: 'patch';
      key: string;
      value: unknown;
      version: Version;
      clientId: string;
      kind: PeerKind;
    }
  | { v: 1; scope: 'state'; type: 'hello'; clientId: string; kind: PeerKind }
  | {
      v: 1;
      scope: 'state';
      type: 'snapshot';
      clientId: string;
      kind: PeerKind;
      state: Record<string, unknown>;
      versions: Record<string, Version>;
    }
  | { v: 1; scope: 'presence'; type: 'hello' | 'ping' | 'bye'; clientId: string; kind: PeerKind }
  | { v: 1; scope: 'leader'; type: 'hello'; clientId: string; kind: PeerKind }
  | {
      v: 1;
      scope: 'leader';
      type: 'claim' | 'heartbeat' | 'resign';
      /** The claimant's term. Arbitrated with newer() — the same clock the store uses. */
      term: Version;
      clientId: string;
      kind: PeerKind;
    }
  | {
      v: 1;
      scope: 'event';
      type: string;
      payload: unknown;
      clientId: string;
      kind: PeerKind;
      msgId: string;
    };

export interface BusOptions extends CommonOptions {
  /** Presence heartbeat interval in ms. Default 2000. */
  heartbeatMs?: number;
}

/**
 * One client identity on one named same-origin bus. Store, presence, and
 * channel engines for the same name share a bus (and thus one clientId and
 * one BroadcastChannel). The bus owns the presence heartbeat, so any client
 * on the bus is visible to peers even if it never creates a Presence.
 */
export interface Bus {
  readonly name: string;
  readonly clientId: string;
  readonly kind: PeerKind;
  post(wire: BusWire): void;
  subscribe(fn: (wire: BusWire) => void): () => void;
  /** Decrement the refcount; the bus shuts down when it reaches zero. */
  release(): void;
}

/** @internal A bus plus the refcount increment used by the registry. */
export interface SharedBus extends Bus {
  acquire(): void;
}
