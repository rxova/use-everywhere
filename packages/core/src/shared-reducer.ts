import { getBus } from './bus.js';
import { newMsgId } from './ids.js';
import { createLeader } from './leader.js';
import type { SharedReducer, SharedReducerOptions } from './shared-reducer.types.js';

/**
 * State that converges by *replaying actions in one order*, rather than by
 * last-writer-wins on a value.
 *
 * ## Why this exists
 *
 * `useSharedState`'s convergence rule is last-writer-wins per key, and for a
 * register — a theme, a selected row, a draft — that is exactly right. For an
 * *accumulating* write it is exactly wrong, and the README's own counter
 * example was the proof: two tabs running `set('n', n => n + 1)` at the same
 * moment both read 4, both write 5, and one increment is silently gone. Nothing
 * is broken, no error is raised, and the number is simply too small.
 *
 * A reducer fixes it by moving what travels. LWW ships the *result* of the
 * increment, so concurrent results overwrite each other; this ships the
 * *increment*, and results are computed by every client from the same ordered
 * list. Two increments are two entries in that list.
 *
 * ## How the order is decided
 *
 * The leader is the sequencer. A dispatch is broadcast as a `propose`; the
 * leader stamps it with the next number and broadcasts a `commit`; every client
 * — the leader included — applies commits strictly in that order. One list, one
 * order, one answer, for *any* reducer.
 *
 * Deliberately not "op-log CRDT for commutative operations", which is cheaper
 * and needs no leader. That design converges only if the reducer happens to be
 * commutative, and nothing in a function's type says whether it is. A library
 * whose rule is that silent divergence is the worst failure mode cannot ship a
 * primitive whose correctness depends on a property it cannot check.
 *
 * ## What it costs
 *
 * A dispatch is applied locally at once and reconciled when its commit arrives,
 * so typing is never gated on the network. If the committed order differs from
 * the optimistic one, the value is rebuilt from committed state plus whatever
 * is still pending — visible as a brief correction, never as a wrong result.
 *
 * Leadership here inherits leadership's own caveat: it is advisory. In the
 * moment two tabs both believe they hold the seat, two commits can carry the
 * same number. The second one to arrive is dropped, and the client asks for a
 * fresh snapshot rather than guessing — so the outcome is a re-sync, not a
 * divergence. Anything that must happen exactly once still needs a server.
 */
export function createSharedReducer<S, A>(
  name: string,
  reducer: (state: S, action: A) => S,
  initial: S,
  options: SharedReducerOptions = {},
): SharedReducer<S, A> {
  const key = options.key ?? 'default';
  const bus = getBus(name, options);
  const clientId = bus.clientId;
  const leader =
    options.leader ??
    createLeader(name, {
      ...options.leaderOptions,
      // Spread conditionally: `exactOptionalPropertyTypes` distinguishes an
      // absent transport from one explicitly set to undefined, and the leader
      // must default its own rather than be handed a hole.
      ...(options.transport ? { transport: options.transport } : {}),
    });
  /** Whether this reducer built the leader, and so is responsible for closing it. */
  const ownsLeader = !options.leader;

  /** Confirmed: the fold of every commit applied so far, in commit order. */
  let committed = initial;
  /** The highest commit number applied. Commits are gapless, so this is also how many. */
  let seq = 0;
  /** Dispatched here, not yet seen coming back as a commit. */
  let pending: { opId: string; action: A }[] = [];
  /** Commits that arrived early, held until the gap before them fills. */
  const early = new Map<number, { action: A; opId: string }>();
  /**
   * The highest number handed out while leading.
   *
   * Needed because a leader's own commits reach it through the transport like
   * everyone else's: between issuing one and applying it, `seq` is behind what
   * has already been promised, and numbering from `seq` alone would reuse a
   * number. Taking the max of the two is what makes a tab that has *just*
   * inherited the seat start from the order it actually observed.
   */
  let lastIssued = 0;

  let view = committed;
  const listeners = new Set<() => void>();
  let closed = false;

  const notify = () => {
    // Rebuilt rather than mutated: subscribers are told the value changed by
    // being handed a different one, which is what useSyncExternalStore needs.
    const next = pending.reduce((state, op) => reducer(state, op.action), committed);
    if (Object.is(next, view)) return;
    view = next;
    for (const fn of listeners) fn();
  };

  const askForSnapshot = () =>
    bus.post({ v: 1, scope: 'op', type: 'hello', key, clientId, kind: bus.kind });

  /**
   * Take a commit, from the wire or from this client's own sequencing.
   *
   * A post never loops back to the client that made it — not through the
   * transport, and not through sibling delivery, which skips the sender. So the
   * leader has to hand its own commits here directly, or it would order
   * everyone else's history and never apply any of it.
   */
  const receiveCommit = (at: number, action: A, opId: string) => {
    if (at <= seq) return; // already applied, or a duplicate number
    if (at > seq + 1) {
      // A gap: something was missed, or two leaders numbered concurrently.
      // Hold it and re-sync rather than applying out of order.
      early.set(at, { action, opId });
      askForSnapshot();
      return;
    }
    applyCommit(at, action, opId);
    notify();
  };

  /** Stamp an action with the next number and tell everyone, including ourselves. */
  const sequence = (action: A, opId: string) => {
    lastIssued = Math.max(lastIssued, seq) + 1;
    const at = lastIssued;
    bus.post({
      v: 1,
      scope: 'op',
      type: 'commit',
      key,
      action,
      opId,
      seq: at,
      clientId,
      kind: bus.kind,
    });
    receiveCommit(at, action, opId);
  };

  /** Apply a commit and anything it unblocks. */
  const applyCommit = (at: number, action: A, opId: string) => {
    committed = reducer(committed, action);
    seq = at;
    // Its own dispatch coming home: stop replaying it optimistically.
    pending = pending.filter((op) => op.opId !== opId);
    const next = early.get(seq + 1);
    if (next) {
      early.delete(seq + 1);
      applyCommit(seq + 1, next.action, next.opId);
    }
  };

  const unsubscribe = bus.subscribe((wire) => {
    if (wire.scope !== 'op' || wire.key !== key) return;

    if (wire.type === 'propose') {
      if (!leader.getSnapshot().isLeader) return;
      sequence(wire.action as A, wire.opId);
      return;
    }

    if (wire.type === 'commit') {
      receiveCommit(wire.seq, wire.action as A, wire.opId);
      return;
    }

    if (wire.type === 'hello') {
      if (seq === 0) return; // nothing worth sending
      bus.post({
        v: 1,
        scope: 'op',
        type: 'snapshot',
        key,
        state: committed,
        seq,
        clientId,
        kind: bus.kind,
      });
      return;
    }

    if (wire.type === 'snapshot') {
      if (wire.seq <= seq) return;
      committed = wire.state as S;
      seq = wire.seq;
      // Anything buffered at or below the snapshot is already folded into it.
      for (const at of [...early.keys()]) if (at <= seq) early.delete(at);
      const next = early.get(seq + 1);
      if (next) {
        early.delete(seq + 1);
        applyCommit(seq + 1, next.action, next.opId);
      }
      notify();
      return;
    }
    // Unknown op types are ignored on purpose — see wire.ts on additive
    // evolution within a protocol version.
  });

  const dispatch = (action: A) => {
    if (closed) return;
    const opId = newMsgId();
    pending.push({ opId, action });
    notify();
    // The leader orders its own dispatches directly. Proposing to itself would
    // be a message it never receives.
    if (leader.getSnapshot().isLeader) sequence(action, opId);
    else
      bus.post({ v: 1, scope: 'op', type: 'propose', key, action, opId, clientId, kind: bus.kind });
  };

  // Late joiner: adopt whatever order already exists before dispatching into it.
  askForSnapshot();

  return {
    clientId,
    getSnapshot: () => view,
    dispatch,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    pendingCount: () => pending.length,
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      listeners.clear();
      if (ownsLeader) leader.close();
      bus.release();
    },
  };
}
