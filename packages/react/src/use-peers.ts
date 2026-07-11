import { useCallback, useSyncExternalStore } from 'react';
import type { Peer } from '@use-everywhere/core';
import { DEFAULT_NAME, getPresence } from './registry.js';

const NO_PEERS: readonly Peer[] = Object.freeze([]);

/** The other tabs/windows/workers currently alive on this origin. */
export function usePeers(options?: { name?: string }): readonly Peer[] {
  const presence = getPresence(options?.name ?? DEFAULT_NAME);
  return useSyncExternalStore(
    useCallback((onChange) => presence.subscribe(onChange), [presence]),
    () => presence.getPeers(),
    () => NO_PEERS,
  );
}

/** This client's own id on the presence bus (matches patch origin ids). */
export function useClientId(options?: { name?: string }): string {
  return getPresence(options?.name ?? DEFAULT_NAME).clientId;
}
