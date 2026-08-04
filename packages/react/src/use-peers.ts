import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Peer } from '@use-everywhere/core';
import { DEFAULT_NAME, getPresence } from './registry.js';
import { SERVER_CLIENT_ID } from './server-stubs.js';

const NO_PEERS: readonly Peer[] = Object.freeze([]);

export interface UsePeersOptions {
  /** Bus name. Default 'use-everywhere'. */
  name?: string;
  /**
   * Include this client in the list. Default false.
   *
   * The default answers "who *else* is here", which is what a presence strip
   * asks. Turn it on for an avatar list, where leaving yourself out means every
   * tab renders a different list of the same room.
   */
  includeSelf?: boolean;
}

/**
 * The tabs/windows/workers currently alive on this origin.
 *
 * Each peer carries whatever it published about itself as `metadata` — see
 * {@link usePresenceMetadata} for publishing this client's.
 */
export function usePeers(options?: UsePeersOptions): readonly Peer[] {
  const presence = getPresence(options?.name ?? DEFAULT_NAME, options?.includeSelf ?? false);
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

/**
 * Publish what this client wants peers to know about it — a display name, a tab
 * title, a cursor.
 *
 * Safe to call with a fresh object every render: the value is compared by
 * contents, so an unchanged one announces nothing and re-renders nobody.
 *
 * ```tsx
 * usePresenceMetadata({ name: user.name, editing: currentDocId });
 * ```
 *
 * Published in an effect rather than during render, because announcing is a
 * side effect on every other tab — and a render that React throws away must not
 * be one other tabs already saw.
 */
export function usePresenceMetadata(metadata: unknown, options?: UsePeersOptions): void {
  const presence = getPresence(options?.name ?? DEFAULT_NAME, options?.includeSelf ?? false);
  useEffect(() => {
    presence.setMetadata(metadata);
  }, [presence, metadata]);
}
