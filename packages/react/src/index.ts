export { useSharedState } from './use-shared-state.js';
export { useSharedReducer } from './use-shared-reducer.js';
export { useSharedSelector, shallowEqual } from './use-shared-selector.js';
export type { UseSharedSelectorOptions } from './use-shared-selector.js';
export type { UseSharedReducerOptions } from './use-shared-reducer.js';
export type { ShareScope, UseSharedStateOptions } from './use-shared-state.types.js';
export { getSharedStore, DEFAULT_NAME } from './registry.js';
export type { AnyStore } from './registry.types.js';
export { useChannel, useOnMessage, useSend, useAsk, useAnswer } from './use-on-message.js';
export type { UseOnMessageOptions } from './use-on-message.js';
export { defineChannel } from './define-channel.js';
export type { ChannelHooks } from './define-channel.types.js';
export { createStoreHooks } from './create-store-hooks.js';
export type { CreateStoreHooksOptions, StoreHooks } from './create-store-hooks.types.js';
export { usePeers, useClientId, usePresenceMetadata } from './use-peers.js';
export type { UsePeersOptions } from './use-peers.js';
export { useHydrated } from './use-hydrated.js';
export { useLeader, useIsLeader, useLeaderEffect } from './use-leader.js';
export type { UseLeaderOptions } from './use-leader.types.js';
export { getLeader } from './registry.js';
// Shadows the core factory on purpose: a React app installs one package, and
// the namespace it wants is the one that carries hooks.
export { createNamespace } from './namespace.js';
export type { ReactNamespace } from './namespace.js';
export { useWindowResult } from './use-window-result.js';
export type {
  UseWindowResult,
  OpenedWindowStatus,
  OpenedWindowState,
  OpenedWindowControls,
} from './use-window-result.types.js';

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
  indexedDbAdapter,
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
  SharedWorkerTransport,
  defaultTransport,
  isBroadcastChannelAvailable,
  isStorageEventAvailable,
  isSharedWorkerAvailable,
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
  // `UseLeaderOptions extends LeaderOptions`, so `useLeader({ locks })` is a
  // valid React call, and that option's TSDoc points at test-utils'
  // `FakeLockManager` — a path users are invited down. Re-exporting the option
  // without its type left them able to pass the value but not name it.
  LockManagerLike,
  StorageLike,
  WebStorageAdapterOptions,
  IndexedDbAdapterOptions,
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
  SharedWorkerTransportOptions,
  // `SharedWorkerTransportOptions.factory` returns a `SharedWorkerLike`, whose
  // ports are `MessagePortLike`. A React app that writes that factory — the
  // reason the option exists — needs to name both, and re-exporting the option
  // without them left it able to pass the value but not type it.
  SharedWorkerLike,
  MessagePortLike,
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
