export { useSharedState } from './use-shared-state.js';
export { useSharedReducer } from './use-shared-reducer.js';
export type { UseSharedReducerOptions } from './use-shared-reducer.js';
export type { ShareScope, UseSharedStateOptions } from './use-shared-state.types.js';
export { getSharedStore, DEFAULT_NAME } from './registry.js';
export type { AnyStore } from './registry.types.js';
export { useChannel, useMessage, useSend, useAsk, useAnswer } from './use-message.js';
export type { UseMessageOptions } from './use-message.js';
export { defineChannel } from './define-channel.js';
export type { ChannelHooks } from './define-channel.types.js';
export { defineStore } from './define-store.js';
export type { DefineStoreOptions, StoreHooks } from './define-store.types.js';
export { usePeers, useClientId } from './use-peers.js';
export { useHydrated } from './use-hydrated.js';
export { useLeader, useIsLeader, useLeaderEffect } from './use-leader.js';
export type { UseLeaderOptions } from './use-leader.types.js';
export { getLeader } from './registry.js';
// Shadows the core factory on purpose: a React app installs one package, and
// the namespace it wants is the one that carries hooks.
export { createNamespace } from './namespace.js';
export type { ReactNamespace } from './namespace.js';
export { useOpenedWindow } from './use-opened-window.js';
export type {
  UseOpenedWindow,
  OpenedWindowStatus,
  OpenedWindowState,
  OpenedWindowControls,
} from './use-opened-window.types.js';

// The core surface, enumerated rather than re-exported with `export *`, so a
// React app still needs one dependency without this package's public API
// silently becoming whatever core happens to export. Anything added to core
// from now on is a deliberate addition here too.
//
// Test seams live on 'use-everywhere/testing'.
export {
  createChannel,
  createSharedStore,
  createSharedReducer,
  createPresence,
  createLeader,
  webStorageAdapter,
  localStorageAdapter,
  sessionStorageAdapter,
  jsonSerializer,
  openWindow,
  connectToOpener,
  CID_PARAM,
  WindowClosedError,
  HandshakeTimeoutError,
  newer,
  observeBus,
  enableDebug,
  getBusNames,
  getTransportKind,
  getWireSkew,
  WIRE_VERSION,
  BroadcastChannelTransport,
  NoopTransport,
  StorageTransport,
  defaultTransport,
  isBroadcastChannelAvailable,
  isStorageEventAvailable,
} from '@use-everywhere/core';
export type {
  Namespace,
  Channel,
  ChannelOptions,
  ReplyMap,
  PostOptions,
  OnOptions,
  AskOptions,
  StandardSchemaV1,
  SchemaMap,
  SchemaOptions,
  InvalidPayload,
  OnInvalid,
  SharedStore,
  SharedStoreOptions,
  SharedReducer,
  SharedReducerOptions,
  Presence,
  PresenceOptions,
  Leader,
  LeaderOptions,
  LeaderSnapshot,
  LeaderStrategy,
  StorageLike,
  WebStorageAdapterOptions,
  Serializer,
  Persisted,
  PersistAdapter,
  PersistOptions,
  RestoreError,
  OpenedWindow,
  OpenerConnection,
  OpenWindowOptions,
  ConnectToOpenerOptions,
  WindowLike,
  WindowEventTarget,
  MessageEventLike,
  BusEvent,
  BusObserver,
  DebugOptions,
  BusWire,
  Transport,
  TransportKind,
  MessageMap,
  MessageMeta,
  Peer,
  PeerKind,
  Version,
  CommonOptions,
} from '@use-everywhere/core';
