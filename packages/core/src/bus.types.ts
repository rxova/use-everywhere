import type { CommonOptions, PeerKind, Version } from './common.types.js';
import type { TransportKind } from './transport/transport.types.js';

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
  /** What is carrying this bus's traffic — 'none' means nothing leaves this context. */
  readonly transportKind: TransportKind;
  post(wire: BusWire): void;
  subscribe(fn: (wire: BusWire) => void): () => void;
  /** Decrement the refcount; the bus shuts down when it reaches zero. */
  release(): void;
}

/**
 * @internal The page-wide half of a bus: one transport, one identity, shared by
 * every handle `connect()` hands out. Lives in the rendezvous table, so a copy
 * of the library that did not build it may still be the one calling it — treat
 * this shape as the compatibility surface between bundled copies, and bump the
 * rendezvous protocol when it changes.
 */
export interface SharedBusCore {
  readonly name: string;
  readonly clientId: string;
  readonly kind: PeerKind;
  readonly transportKind: TransportKind;
  /** The heartbeat the bus was created with — kept so later callers asking for a different one can be warned. */
  readonly heartbeatMs: number;
  /** Take a handle on this bus, incrementing the refcount. */
  connect(): Bus;
}
