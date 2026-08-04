import { getBus } from './bus.js';
import type { BusOptions } from './bus.types.js';
import type { Version } from './common.types.js';
import type { Leader, LeaderOptions, LeaderSnapshot, LockManagerLike } from './leader.types.js';

const NO_LEADER: LeaderSnapshot = Object.freeze({ leaderId: null, isLeader: false });

/**
 * Leadership arbitrated by the browser's Web Locks queue.
 *
 * The heartbeat strategy has to *infer* that a leader is gone from silence,
 * which is why it needs a lease — and why a backgrounded tab whose timers are
 * clamped can be deposed while perfectly healthy. Here the browser owns the
 * queue: exactly one caller holds a named lock, the next in line is granted it
 * the instant the holder's page goes away (crash included, since the release is
 * the browser's job, not ours), and holding it depends on no timer at all. No
 * lease, no heartbeat, no split brain.
 *
 * The bus is still used, for one thing the lock cannot do: telling the other
 * tabs *who* holds it. Web Locks grants a lock; it does not carry an identity
 * peers can render. So the holder announces itself, and answers a joiner's
 * hello — the same two wires the heartbeat strategy already uses, so a
 * follower's view of the world is identical under both.
 */
export function createWebLocksLeader(
  name: string,
  options: LeaderOptions,
  locks: LockManagerLike,
): Leader {
  // Only what the bus owns — see the note in leader.ts about heartbeatMs
  // meaning two different things.
  const busOptions: BusOptions = {
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
  };
  const bus = getBus(name, busOptions);
  const clientId = bus.clientId;

  let eligible = options.eligible ?? true;
  let leaderId: string | null = null;
  let snapshot: LeaderSnapshot = NO_LEADER;
  let closed = false;

  const listeners = new Set<() => void>();
  const waiters = new Set<{ resolve: () => void; reject: (error: unknown) => void }>();

  /** Resolving this hands the lock back; null when we are not holding one. */
  let releaseHeld: (() => void) | null = null;
  /** Cancels a request still queued behind another tab. */
  let pending: AbortController | null = null;

  function setLeader(id: string | null) {
    // Same contract as the heartbeat strategy: mint no object and wake no
    // listener unless the answer actually changed, or useSyncExternalStore
    // loops forever.
    if (id === leaderId) return;
    leaderId = id;
    snapshot = Object.freeze({ leaderId: id, isLeader: id === clientId });
    for (const fn of listeners) fn();
    if (id === clientId) {
      for (const waiter of waiters) waiter.resolve();
      waiters.clear();
    }
  }

  // A term is meaningless here — the lock, not the clock, decides — but the
  // wire format is shared, and a peer on the heartbeat strategy reading these
  // would still arbitrate them sanely.
  const term: Version = [1, clientId];
  const announce = () =>
    bus.post({ v: 1, scope: 'leader', type: 'heartbeat', term, clientId, kind: bus.kind });

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'leader') return;
    if (wire.type === 'hello') {
      // Answer a joiner at once so it never renders an empty seat that is
      // actually taken.
      if (leaderId === clientId) announce();
      return;
    }
    if (wire.type === 'resign') {
      if (wire.clientId === leaderId) setLeader(null);
      return;
    }
    // claim | heartbeat: whoever announces holds the lock, because the browser
    // would not have granted it otherwise. There is nothing to arbitrate — and
    // no need to exclude ourselves, since the bus never delivers our own wires
    // back to us.
    setLeader(wire.clientId);
  });

  function joinQueue() {
    if (closed || !eligible || releaseHeld || pending) return;
    const controller = new AbortController();
    pending = controller;
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    // The callback holds the lock for as long as its promise is unsettled,
    // which is the whole mechanism: we keep it until we resign, close, or the
    // page goes away and the browser reclaims it for us.
    void locks
      .request(name, { signal: controller.signal }, async () => {
        pending = null;
        if (closed || !eligible) return;
        setLeader(clientId);
        announce();
        await held;
      })
      .catch(() => {
        // AbortError when we cancelled while still queued. Nothing to report:
        // giving up a place in the queue is a thing we asked for, and both
        // callers that abort clear `pending` themselves.
      });
  }

  /** Hand the lock back, if we hold one. */
  function letGo() {
    const release = releaseHeld;
    releaseHeld = null;
    release?.();
  }

  function resign() {
    if (leaderId !== clientId) return;
    letGo();
    setLeader(null);
    bus.post({ v: 1, scope: 'leader', type: 'resign', term, clientId, kind: bus.kind });
    // Straight back into the queue behind whoever was waiting. If nobody was,
    // the browser hands it back to us — which is correct: an eligible tab
    // standing alone should lead. resign() moves the seat when there is
    // somewhere for it to move.
    joinQueue();
  }

  // Stryker disable next-line all: environment detection — both halves are true in every browser-like test env and false in every Node one, so no mutant of this line is distinguishable.
  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  const onPageHide = () => resign();
  // No pageshow counterpart: a tab restored from bfcache still holds, or is
  // still queued for, the lock it had — the browser kept the queue for us.
  if (hasWindow) addEventListener('pagehide', onPageHide);

  bus.post({ v: 1, scope: 'leader', type: 'hello', clientId, kind: bus.kind });
  joinQueue();

  return {
    clientId,
    strategy: 'web-locks',
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    waitForLeadership() {
      if (leaderId === clientId) return Promise.resolve();
      if (closed) return Promise.reject(new Error('leader is closed'));
      return new Promise<void>((resolve, reject) => {
        waiters.add({ resolve, reject });
      });
    },
    resign,
    setEligible(next: boolean) {
      if (next === eligible) return;
      eligible = next;
      if (next) {
        joinQueue();
        return;
      }
      // Withdraw entirely: drop the lock if we hold it, and leave the queue if
      // we were merely waiting.
      if (leaderId === clientId) resignWithoutRequeue();
      pending?.abort();
      pending = null;
    },
    close() {
      if (closed) return;
      closed = true;
      if (leaderId === clientId) resignWithoutRequeue();
      pending?.abort();
      pending = null;
      if (hasWindow) removeEventListener('pagehide', onPageHide);
      for (const waiter of waiters) waiter.reject(new Error('leader is closed'));
      waiters.clear();
      unsubscribe();
      listeners.clear();
      bus.release();
    },
  };

  /** Resign for good — used when withdrawing or shutting down, where re-queuing would be wrong. */
  function resignWithoutRequeue() {
    letGo();
    setLeader(null);
    bus.post({ v: 1, scope: 'leader', type: 'resign', term, clientId, kind: bus.kind });
  }
}
