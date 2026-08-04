export { createChannel } from './channel.js';
export type { Channel } from './channel.types.js';
export { createSharedStore } from './shared-store.js';
export type { SharedStore, SharedStoreOptions } from './shared-store.types.js';
export { createPresence } from './presence.js';
export type { Presence, PresenceOptions } from './presence.types.js';
export { createLeader } from './leader.js';
export type { Leader, LeaderOptions, LeaderSnapshot, LeaderStrategy } from './leader.types.js';
export {
  webStorageAdapter,
  localStorageAdapter,
  sessionStorageAdapter,
} from './persist-web-storage.js';
export type { StorageLike, WebStorageAdapterOptions } from './persist-web-storage.js';
export type { Persisted, PersistAdapter, PersistOptions } from './persist.types.js';
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
export { DEFAULT_NAME } from './defaults.js';
export { observeBus, enableDebug } from './debug.js';
export { getBusNames, getTransportKind } from './bus.js';
export { WIRE_VERSION, getWireSkew } from './wire.js';
export type { BusEvent, BusObserver, DebugOptions } from './debug.types.js';
export type { BusWire } from './bus.types.js';
export type { Transport, TransportKind } from './transport/transport.types.js';
export { BroadcastChannelTransport } from './transport/broadcast-channel-transport.js';
export { NoopTransport } from './transport/noop-transport.js';
export { StorageTransport } from './transport/storage-transport.js';
export {
  defaultTransport,
  isBroadcastChannelAvailable,
  isStorageEventAvailable,
} from './transport/default-transport.js';
// MemoryHub and MemoryTransport are test seams: import them from
// '@use-everywhere/core/testing'. Keeping them here made a simulation harness
// part of the runtime API surface, and 1.0 has to promise not to break it.
export type {
  MessageMap,
  MessageMeta,
  Peer,
  PeerKind,
  Version,
  CommonOptions,
} from './common.types.js';
