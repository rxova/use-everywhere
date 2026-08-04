import type { Transport } from './transport/transport.types.js';

export type MessageMap = Record<string, unknown>;

export type PeerKind = 'tab' | 'worker' | (string & {});

/** Per-key logical clock: [counter, clientId]. Ties break by clientId. */
export type Version = readonly [counter: number, clientId: string];

export interface Peer {
  id: string;
  kind: PeerKind;
  lastSeen: number;
  /** What that client published about itself, if anything. */
  metadata?: unknown;
}

export interface MessageMeta {
  clientId: string;
  kind: PeerKind;
  self: boolean;
}

export interface CommonOptions {
  /** Transport factory, mainly for tests. Defaults to defaultTransport. */
  transport?: (name: string) => Transport;
  /** What this client announces itself as. Defaults to 'worker' when there is no document, else 'tab'. */
  kind?: PeerKind;
}
