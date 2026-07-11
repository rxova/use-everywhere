export { createChannel, type Channel } from './channel.js';
export { createSharedStore, type SharedStore } from './shared-store.js';
export { createPresence, type Presence, type PresenceOptions } from './presence.js';
export {
  openWindow,
  connectToOpener,
  CID_PARAM,
  type OpenedWindow,
  type OpenerConnection,
  type OpenWindowOptions,
  type ConnectToOpenerOptions,
  type WindowLike,
  type WindowEventTarget,
} from './window-channel.js';
export { WindowClosedError, HandshakeTimeoutError } from './errors.js';
export { newer } from './clock.js';
export type { Transport } from './transport/transport.js';
export {
  BroadcastChannelTransport,
  NoopTransport,
  defaultTransport,
  isBroadcastChannelAvailable,
} from './transport/broadcast-channel.js';
export { MemoryHub, MemoryTransport } from './transport/memory.js';
export type {
  MessageMap,
  MessageMeta,
  Peer,
  PeerKind,
  Version,
  CommonOptions,
} from './types.js';
