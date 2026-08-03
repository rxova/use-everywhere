export { useSharedState } from './use-shared-state.js';
export type { ShareScope, UseSharedStateOptions } from './use-shared-state.types.js';
export { getSharedStore, DEFAULT_NAME } from './registry.js';
export type { AnyStore } from './registry.types.js';
export { useChannel, useMessage, useSend } from './use-message.js';
export { defineChannel } from './define-channel.js';
export type { ChannelHooks } from './define-channel.types.js';
export { defineStore } from './define-store.js';
export type { DefineStoreOptions, StoreHooks } from './define-store.types.js';
export { usePeers, useClientId } from './use-peers.js';
export { useLeader, useIsLeader, useLeaderEffect } from './use-leader.js';
export type { UseLeaderOptions } from './use-leader.types.js';
export { getLeader } from './registry.js';
export { useOpenedWindow } from './use-opened-window.js';
export type {
  UseOpenedWindow,
  OpenedWindowStatus,
  OpenedWindowState,
  OpenedWindowControls,
} from './use-opened-window.types.js';

// Full core surface, so React apps need a single dependency.
export * from '@use-everywhere/core';
