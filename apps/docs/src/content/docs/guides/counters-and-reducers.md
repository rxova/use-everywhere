---
title: 'Counters and reducers'
sidebar:
  order: 10
---

Shared state converges **last-writer-wins per key**. For a register — a theme, a
selection, a draft — that is exactly right.

For an _accumulating_ write it is exactly wrong:

```tsx
// Two tabs, at the same moment. Both read 4. Both write 5.
const [count, setCount] = useSharedState('count', 0);
setCount((n) => n + 1);
```

The answer is 5. It should be 6. Nothing errored, nothing warned, and the number
is simply too small — which is the failure mode this library exists to make
impossible.

The cause is _what travels_. Last-writer-wins ships the **result** of the
increment, so two concurrent results overwrite each other. A reducer ships the
**increment**, and two increments are two entries in a list every tab replays.

```tsx
import { useSharedReducer } from 'use-everywhere';

const [count, dispatch] = useSharedReducer((n, action) => n + action.by, 0);

<button onClick={() => dispatch({ by: 1 })}>{count}</button>;
```

Now the answer is 6.

## Which one to reach for

|                                                      | Use                |
| ---------------------------------------------------- | ------------------ |
| Theme, selected row, form draft, "is the panel open" | `useSharedState`   |
| Counter, running total, append-to-a-list, undo stack | `useSharedReducer` |

The test is whether a write depends on what is already there. `setTheme('dark')`
does not. `n => n + 1` does.

`useSharedState` stays the default and the cheaper one — no leader, no ordering,
no action objects on the wire.

## How the order is decided

The leader is the **sequencer**. A dispatch is broadcast as a proposal; the
leader stamps it with the next number; every tab — the leader included — applies
commits strictly in that order.

That is what makes it correct for _any_ reducer, not just commutative ones. An
op-log CRDT would be cheaper and need no leader, but it converges only if your
reducer happens to be commutative, and nothing in a function's type says whether
it is. A library whose whole rule is that silent divergence is the worst outcome
can't ship a primitive whose correctness rests on a property it can't check.

It shares the leader with `useLeader` on the same bus rather than electing a
second one.

## Latency, and the brief correction

A dispatch applies **locally first**, so a click never waits for the network. If
the committed order turns out to differ from the optimistic one, the value is
rebuilt from committed state plus whatever is still pending.

So a value can be _seen_ out of order for a frame, and never _settles_ out of
order. If you are showing something where that flicker matters, `pendingCount()`
on the core engine tells you whether this client's view is fully confirmed.

The tab holding the seat commits its own dispatches with no round trip at all.

## The rules

**Actions must survive the wire.** They are structured-cloned to every peer: no
functions, no class instances, no DOM nodes. Same constraint as
[shared state values](./shared-state.md).

**The reducer must be pure, and the same everywhere.** Every client folds the
same actions itself. A client whose fold differs gets a different answer, and
nothing can detect that. Deploying a changed reducer is a
[version skew](../under-the-hood/version-skew.md) problem — bump the wire
version or key the reducer by release if the fold changes meaning.

**The first caller's reducer wins** for the life of the page. A re-render passes
a new function identity every time, and swapping the fold under a history
already applied is the divergence this exists to prevent.

## What it is not

It is **not a distributed lock**, and not exactly-once. Leadership is advisory:
for the moment two tabs both believe they hold the seat, two commits can carry
the same number. The second is dropped and the client re-syncs from a snapshot —
so the outcome is a correction, never a divergence. Anything that must happen
exactly once still needs a server-side idempotency key.

It is **not a CRDT**, and there are no plans for one. `useSharedReducer` is the
ceiling for this library; past it, reach for Yjs or Automerge.

## Related

- [Shared state](./shared-state.md) — the register semantics this complements
- [Version skew & the wire contract](../under-the-hood/version-skew.md) — what
  happens when two deploys disagree about the fold
- [Limitations & FAQ](../under-the-hood/limitations.md) — leadership is advisory
