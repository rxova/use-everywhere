import { useCallback, useSyncExternalStore } from 'react';
import type { Peer } from '@use-everywhere/core';
import { DEFAULT_NAME, getPresence } from './registry.js';
import { SERVER_CLIENT_ID } from './server-stubs.js';

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

/**
 * This client's own id on the presence bus (matches patch origin ids).
 *
 * Read through useSyncExternalStore rather than returned straight from render,
 * because the id is minted per environment: a server would render one value and
 * the browser a different one, and any component that puts it in the DOM would
 * mismatch on hydration. The server snapshot is a constant empty string, which
 * React also uses for the client's hydrating render, so markup matches; the
 * real id arrives in the commit straight after. Treat `''` as "not known yet".
 */
export function useClientId(options?: { name?: string }): string {
  const presence = getPresence(options?.name ?? DEFAULT_NAME);
  return useSyncExternalStore(
    // The id never changes for the life of a presence engine, so there is
    // nothing to subscribe to — but uSES still needs the post-hydration read,
    // which it performs when it attaches this subscription.
    useCallback(() => () => {}, [presence]),
    () => presence.clientId,
    () => SERVER_CLIENT_ID,
  );
}
