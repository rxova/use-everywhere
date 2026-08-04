import type { CommonOptions, PeerKind, Version } from './common.types.js';
import type { TransportKind } from './transport/transport.types.js';

/**
 * Everything on the same-origin bus, multiplexed by scope over one
 * BroadcastChannel per name.
 *
 * `v` is the wire protocol version, and changing it is a decision with rules —
 * see `wire.ts` for what may be added within a version and what must bump it.
 */
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
  // The op scope carries reducer traffic, which is ordered rather than
  // last-writer-wins. `key` separates reducers sharing one bus, the way the
  // state scope's `key` separates store keys.
  | { v: 1; scope: 'op'; type: 'hello'; key: string; clientId: string; kind: PeerKind }
  | {
      v: 1;
      scope: 'op';
      type: 'propose';
      key: string;
      action: unknown;
      /** Identifies this dispatch across its proposal and its commit, so a commit can be recognised as one's own and applied once. */
      opId: string;
      clientId: string;
      kind: PeerKind;
    }
  | {
      v: 1;
      scope: 'op';
      type: 'commit';
      key: string;
      action: unknown;
      opId: string;
      /** The leader's ordering decision: a gapless counter every client replays in the same order. */
      seq: number;
      clientId: string;
      kind: PeerKind;
    }
  | {
      v: 1;
      scope: 'op';
      type: 'snapshot';
      key: string;
      state: unknown;
      seq: number;
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
