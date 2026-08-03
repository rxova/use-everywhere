import { getBus } from './bus.js';
import type { Peer } from './common.types.js';
import type { Presence, PresenceOptions } from './presence.types.js';

/**
 * Tracks the other tabs/windows/workers on this bus. Any message from a peer
 * counts as a liveness signal (state patches, events, and presence pings all
 * piggyback); explicit 'bye' or silence past pruneAfterMs removes them.
 */
export function createPresence(name: string, options: PresenceOptions = {}): Presence {
  const pruneAfterMs = options.pruneAfterMs ?? 5000;
  const bus = getBus(name, options);
  const peers = new Map<string, Peer>();
  const listeners = new Set<() => void>();
  let snapshot: readonly Peer[] = [];

  function notify() {
    snapshot = Object.freeze([...peers.values()]);
    for (const fn of listeners) fn();
  }

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope === 'presence' && wire.type === 'bye') {
      if (peers.delete(wire.clientId)) notify();
      return;
    }
    const existing = peers.get(wire.clientId);
    peers.set(wire.clientId, { id: wire.clientId, kind: wire.kind, lastSeen: Date.now() });
    if (!existing) notify();
  });

  // The bus only says hello when *it* is created. A presence engine attached to
  // a bus that already existed — a store made it first, and this is the
  // component that wants the roster — would otherwise start empty and stay that
  // way until the next heartbeat, which is a visible blank for up to
  // heartbeatMs. Announcing again costs one wire and peers answer immediately.
  bus.post({ v: 1, scope: 'presence', type: 'hello', clientId: bus.clientId, kind: bus.kind });

  const prune = setInterval(
    () => {
      const cutoff = Date.now() - pruneAfterMs;
      let changed = false;
      for (const [id, peer] of peers) {
        if (peer.lastSeen < cutoff) {
          peers.delete(id);
          changed = true;
        }
      }
      if (changed) notify();
    },
    Math.max(500, Math.floor(pruneAfterMs / 2)),
  );

  let closed = false;
  return {
    clientId: bus.clientId,
    getPeers: () => snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(prune);
      unsubscribe();
      listeners.clear();
      bus.release();
    },
  };
}
