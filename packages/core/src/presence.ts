import { getBus } from './bus.js';
import type { Peer } from './common.types.js';
import type { Presence, PresenceOptions } from './presence.types.js';

/**
 * Tracks the other tabs/windows/workers on this bus. Any message from a peer
 * counts as a liveness signal (state patches, events, and presence pings all
 * piggyback); an explicit 'bye' removes them at once.
 *
 * Silence, though, is not proof of death — and treating it that way is what
 * made the roster flap. Browsers clamp a hidden tab's timers to roughly one
 * tick a minute, so a perfectly healthy backgrounded peer stops heartbeating,
 * gets pruned, pings once, is re-added, and disappears again: a peer count
 * oscillating once a minute for no reason. Waking a laptop does it to every
 * peer at once.
 *
 * What saves it is that *message handlers are not throttled* — only timers are.
 * A hidden tab still answers a hello the instant it arrives. So a peer that
 * goes quiet is probed rather than dropped, and only silence that survives the
 * probe counts as gone.
 */
export function createPresence(name: string, options: PresenceOptions = {}): Presence {
  const pruneAfterMs = options.pruneAfterMs ?? 5000;
  const probeGraceMs = options.probeGraceMs ?? 1000;
  const bus = getBus(name, options);
  const peers = new Map<string, Peer>();
  const listeners = new Set<() => void>();
  let snapshot: readonly Peer[] = [];
  let metadata = options.metadata;

  /**
   * Value equality, not reference.
   *
   * Metadata arrives freshly deserialised every time, so a peer re-announcing
   * the same thing produces a new object — and a reference check would call
   * that a change and re-render every subscriber. Serialising is affordable
   * because metadata is a name or a cursor, not a document.
   */
  const same = (a: unknown, b: unknown) => {
    if (Object.is(a, b)) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      /* v8 ignore next -- unserialisable metadata cannot cross the wire anyway */
      return false;
    }
  };

  const self = (): Peer => ({
    id: bus.clientId,
    kind: bus.kind,
    lastSeen: Date.now(),
    ...(metadata === undefined ? {} : { metadata }),
  });

  function notify() {
    const roster = [...peers.values()];
    snapshot = Object.freeze(options.includeSelf ? [self(), ...roster] : roster);
    for (const fn of listeners) fn();
  }

  const announce = () =>
    bus.post({
      v: 1,
      scope: 'presence',
      type: 'hello',
      clientId: bus.clientId,
      kind: bus.kind,
      ...(metadata === undefined ? {} : { metadata }),
    });

  const unsubscribe = bus.subscribe((wire) => {
    // Traffic from a sibling engine on this page carries our own clientId,
    // because a page is one client. Counting it would put us in our own peer
    // list — "1 other tab" while alone in the browser.
    if (wire.clientId === bus.clientId) return;
    if (wire.scope === 'presence' && wire.type === 'bye') {
      if (peers.delete(wire.clientId)) notify();
      return;
    }
    const existing = peers.get(wire.clientId);
    // Only a hello carries metadata, so a ping must leave what is already known
    // in place rather than blanking it on every heartbeat.
    const announced = wire.scope === 'presence' ? wire.metadata : undefined;
    const next = announced === undefined ? existing?.metadata : announced;
    peers.set(wire.clientId, {
      id: wire.clientId,
      kind: wire.kind,
      lastSeen: Date.now(),
      ...(next === undefined ? {} : { metadata: next }),
    });
    if (!existing || !same(existing.metadata, next)) notify();
  });

  // The bus only says hello when *it* is created. A presence engine attached to
  // a bus that already existed — a store made it first, and this is the
  // component that wants the roster — would otherwise start empty and stay that
  // way until the next heartbeat, which is a visible blank for up to
  // heartbeatMs. Announcing again costs one wire and peers answer immediately.
  announce();
  // Self is in the roster from the first read when asked for, rather than
  // appearing once somebody else shows up.
  if (options.includeSelf) notify();

  /** Peers we have asked to speak up, and when we asked. */
  const probed = new Map<string, number>();

  const prune = setInterval(
    () => {
      const now = Date.now();
      const silentSince = now - pruneAfterMs;
      let changed = false;
      let needProbe = false;

      for (const [id, peer] of peers) {
        if (peer.lastSeen >= silentSince) {
          probed.delete(id); // spoke recently; nothing to answer for
          continue;
        }
        const askedAt = probed.get(id);
        if (askedAt === undefined) {
          // First time it looks gone. Ask before concluding.
          probed.set(id, now);
          needProbe = true;
        } else if (now - askedAt >= probeGraceMs) {
          // Asked, and heard nothing back. Now it is gone.
          peers.delete(id);
          probed.delete(id);
          changed = true;
        }
      }

      // One hello covers every suspect at once: the bus answers a hello with a
      // ping, so anybody still alive re-registers on the next tick.
      if (needProbe) announce();
      if (changed) notify();
    },
    Math.max(250, Math.floor(Math.min(pruneAfterMs, probeGraceMs) / 2)),
  );

  let closed = false;
  return {
    clientId: bus.clientId,
    getPeers: () => snapshot,
    setMetadata(next) {
      if (same(metadata, next)) return;
      metadata = next;
      announce();
      notify();
    },
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
