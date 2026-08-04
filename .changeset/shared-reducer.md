---
'@use-everywhere/core': minor
---

Add `createSharedReducer` — state that converges by replaying actions in one order, not by last-writer-wins on a value.

This closes the library's most visible correctness wart, and it was the README's own example: two tabs running `set('n', n => n + 1)` at the same moment both read 4, both write 5, and one increment is silently gone. Nothing errors, nothing warns, the number is just too small.

The cause is _what travels_. Last-writer-wins ships the **result** of the increment, so concurrent results overwrite each other. A reducer ships the **increment**, and two increments are two entries in a list every client replays.

```ts
const votes = createSharedReducer('poll', (n, action) => n + action.by, 0);
votes.dispatch({ by: 1 });
```

**The leader is the sequencer.** A dispatch is broadcast as a proposal; the leader stamps it with the next number; every client — the leader included — applies commits strictly in that order. That is what makes it correct for _any_ reducer.

Deliberately **not** an op-log CRDT for commutative operations, which is cheaper and needs no leader. That design converges only if the reducer happens to be commutative, and nothing in a function's type says whether it is. A library whose rule is that silent divergence is the worst failure mode cannot ship a primitive whose correctness depends on a property it cannot check.

Dispatches apply locally first, so a click never waits on the network, and are reconciled when their commit arrives. A value can therefore be _seen_ out of order for a moment and never _settles_ out of order; `pendingCount()` reports whether this client's view is fully confirmed. The tab holding the seat commits its own dispatches with no round trip at all.

It reuses an existing `Leader` when handed one, rather than running a second election, and several reducers share a bus by `key` the way store keys do.

Ordering rides a new `op` wire scope. Adding a scope is additive within wire v1 — every existing engine already ignores scopes it does not recognise — so a tab on an older build is unaffected rather than confused.

**What it is not.** Leadership is advisory: in the window where two tabs both believe they hold the seat, two commits can carry the same number. The second is dropped and the client re-syncs from a snapshot, so the outcome is a correction rather than a divergence — but anything that must happen exactly once still needs a server-side idempotency key. This is the ceiling for this library; past it, reach for a real CRDT.
