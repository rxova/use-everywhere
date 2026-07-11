export { createChannel } from './channel.js';
export type { Channel } from './channel.types.js';
export { createSharedStore } from './shared-store.js';
export type { SharedStore, SharedStoreOptions } from './shared-store.types.js';
export { createPresence } from './presence.js';
export type { Presence, PresenceOptions } from './presence.types.js';
export { openWindow, connectToOpener, CID_PARAM } from './window-channel.js';
export type {
  OpenedWindow,
  OpenerConnection,
  OpenWindowOptions,
  ConnectToOpenerOptions,
  WindowLike,
  WindowEventTarget,
  MessageEventLike,
} from './window-channel.types.js';
export { WindowClosedError } from './errors/window-closed-error.js';
export { HandshakeTimeoutError } from './errors/handshake-timeout-error.js';
export { newer } from './clock.js';
export type { Transport } from './transport/transport.types.js';
export { BroadcastChannelTransport } from './transport/broadcast-channel-transport.js';
export { NoopTransport } from './transport/noop-transport.js';
export { defaultTransport, isBroadcastChannelAvailable } from './transport/default-transport.js';
export { MemoryHub } from './transport/memory-hub.js';
export { MemoryTransport } from './transport/memory-transport.js';
export type {
  MessageMap,
  MessageMeta,
  Peer,
  PeerKind,
  Version,
  CommonOptions,
} from './common.types.js';
