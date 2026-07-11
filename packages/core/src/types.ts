import type { Transport } from './transport/transport.js';

export type MessageMap = Record<string, unknown>;

export type PeerKind = 'tab' | 'worker' | (string & {});

/** Per-key logical clock: [counter, clientId]. Ties break by clientId. */
export type Version = readonly [counter: number, clientId: string];

export interface Peer {
  id: string;
  kind: PeerKind;
  lastSeen: number;
}

export interface MessageMeta {
  clientId: string;
  kind: PeerKind;
  self: boolean;
}

export interface CommonOptions {
  /** Transport factory, mainly for tests. Defaults to BroadcastChannelTransport. */
  transport?: (name: string) => Transport;
  /** What this client announces itself as. Defaults to 'worker' when there is no document, else 'tab'. */
  kind?: PeerKind;
}

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
  | {
      v: 1;
      scope: 'event';
      type: string;
      payload: unknown;
      clientId: string;
      kind: PeerKind;
      msgId: string;
    };

export function isBusWire(data: unknown): data is BusWire {
  return typeof data === 'object' && data !== null && (data as { v?: unknown }).v === 1;
}

export function defaultKind(): PeerKind {
  return typeof document === 'undefined' ? 'worker' : 'tab';
}
