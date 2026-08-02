import { getBus } from './bus.js';
import type { BusOptions } from './bus.types.js';
import { newer } from './clock.js';
import type { Version } from './common.types.js';
import type { Leader, LeaderOptions, LeaderSnapshot } from './leader.types.js';

const NO_LEADER: LeaderSnapshot = Object.freeze({ leaderId: null, isLeader: false });

/**
 * Elects exactly one client on the bus to hold a seat: the tab that owns the
 * WebSocket, polls, or refreshes the token, while the others stand by.
 *
 * Lease and claim, with a sticky incumbent. A leader re-announces every
 * heartbeatMs; followers give up on it after leaseMs of silence and claim the
 * seat with a higher term. Terms are Versions, arbitrated by the same newer()
 * the store uses, so simultaneous claims resolve deterministically instead of
 * flapping.
 *
 * Leadership is advisory. It is not a distributed lock, and a hidden tab whose
 * timers are throttled can lose a lease it deserved to keep.
 */
export function createLeader(name: string, options: LeaderOptions = {}): Leader {
  const heartbeatMs = options.heartbeatMs ?? 1000;
  const leaseMs = options.leaseMs ?? 3000;

  // LeaderOptions is structurally assignable to BusOptions — both carry an
  // optional heartbeatMs — so `getBus(name, options)` would compile and quietly
  // retune the *presence* ping to the leader's rate for every engine on this
  // bus, origin-wide, with no test failing. Forward only what the bus owns.
  // (Spread conditionally: exactOptionalPropertyTypes rejects `x: undefined`.)
  const busOptions: BusOptions = {
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
  };
  const bus = getBus(name, busOptions);
  const clientId = bus.clientId;

  let eligible = options.eligible ?? true;
  let leaderId: string | null = null;
  // Counter 0 means "never held a term". Every real term starts at 1, so this
  // loses to any genuine claim — which removes the impossible "no term yet"
  // branch from every post site below.
  let term: Version = [0, clientId];
  let snapshot: LeaderSnapshot = NO_LEADER;
  let beat: ReturnType<typeof setInterval> | undefined;
  let lease: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const listeners = new Set<() => void>();

  function setLeader(id: string | null) {
    // A heartbeat that merely confirms the incumbent must mint no object and
    // wake no listener — that is what makes getSnapshot safe for
    // useSyncExternalStore, which would otherwise loop forever.
    if (id === leaderId) return;
    leaderId = id;
    snapshot = Object.freeze({ leaderId: id, isLeader: id === clientId });
    for (const fn of listeners) fn();
  }

  function armLease(delay: number) {
    clearTimeout(lease);
    lease = setTimeout(onLeaseExpired, delay);
  }

  function onLeaseExpired() {
    if (closed) return;
    setLeader(null);
    // An ineligible client still arms the lease, so a dead leader clears to
    // null here instead of lingering as a ghost nobody ever unseats.
    if (eligible) claim();
  }

  function heartbeat() {
    bus.post({ v: 1, scope: 'leader', type: 'heartbeat', term, clientId, kind: bus.kind });
  }

  function claim() {
    term = [term[0] + 1, clientId];
    setLeader(clientId);
    bus.post({ v: 1, scope: 'leader', type: 'claim', term, clientId, kind: bus.kind });
    clearInterval(beat);
    beat = setInterval(heartbeat, heartbeatMs);
  }

  function stepDown(next: string | null) {
    clearInterval(beat);
    beat = undefined;
    setLeader(next);
  }

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'leader') return;

    if (wire.type === 'hello') {
      // Answer a joiner immediately so it adopts us instead of sitting
      // leaderless for a lease. Mirrors presence/hello -> ping.
      if (leaderId === clientId) heartbeat();
      return;
    }

    if (wire.type === 'resign') {
      if (wire.clientId !== leaderId) return;
      // Keep our term: the next claim must strictly beat the one just vacated.
      setLeader(null);
      // Zero, not leaseMs — the seat is known empty, so fail over now.
      armLease(0);
      return;
    }

    // claim | heartbeat
    if (newer(wire.term, term)) {
      term = wire.term;
      stepDown(wire.clientId);
      armLease(leaseMs);
      return;
    }

    if (leaderId === clientId) {
      // A stale claimant is out of date; re-assert so it concedes in one round
      // trip rather than both of us believing we lead.
      heartbeat();
      return;
    }

    if (wire.clientId === leaderId) armLease(leaseMs);
  });

  function resign() {
    if (leaderId !== clientId) return;
    const resigning = term;
    stepDown(null);
    bus.post({ v: 1, scope: 'leader', type: 'resign', term: resigning, clientId, kind: bus.kind });
    // Receivers re-arm at 0; we wait a full lease, or we would instantly
    // re-elect ourselves and resign() would be a no-op.
    armLease(leaseMs);
  }

  const sayHello = () =>
    bus.post({ v: 1, scope: 'leader', type: 'hello', clientId, kind: bus.kind });

  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  const onPageHide = () => resign();
  // Restored from bfcache: we resigned on the way out and heard nothing while
  // cached, so whoever leads now is unknown. Rejoin exactly like at creation —
  // hello makes an incumbent answer at once, one silent beat means the seat is
  // free to claim.
  const onPageShow = (event: Event) => {
    if (!(event as { persisted?: boolean }).persisted) return;
    sayHello();
    armLease(heartbeatMs);
  };
  if (hasWindow) {
    addEventListener('pagehide', onPageHide);
    addEventListener('pageshow', onPageShow);
  }

  sayHello();
  // One heartbeat, not one lease: an incumbent answers our hello at once, so a
  // single beat of silence already means the seat is empty. A lone tab leads
  // after heartbeatMs instead of idling for leaseMs.
  armLease(heartbeatMs);

  return {
    clientId,
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    resign,
    setEligible(next: boolean) {
      if (next === eligible) return;
      eligible = next;
      if (!next) {
        if (leaderId === clientId) resign();
        return;
      }
      // Becoming eligible while the seat is empty: nothing is going to wake us
      // otherwise, because the lease that found it empty already fired and an
      // ineligible client does not re-arm.
      if (leaderId === null) armLease(0);
    },
    close() {
      if (closed) return;
      closed = true;
      resign();
      clearInterval(beat);
      clearTimeout(lease);
      if (hasWindow) {
        removeEventListener('pagehide', onPageHide);
        removeEventListener('pageshow', onPageShow);
      }
      unsubscribe();
      listeners.clear();
      bus.release();
    },
  };
}
