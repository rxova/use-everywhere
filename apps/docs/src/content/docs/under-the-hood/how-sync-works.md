---
title: "How sync works"
sidebar:
  order: 1
---

This page opens the hood. You don't need any of it to _use_
the library — but when you want to reason about an edge case ("what if both
tabs write at the same millisecond?", "what does a brand-new tab actually
see?"), this walkthrough gives you the machinery: version clocks, the
late-joiner handshake, presence, and the cross-origin handshake.

## Every key carries a clock

A shared store is a **replicated object**: every tab holds a full copy, and
every _key_ carries a version — a pair `[counter, clientId]`. Writing bumps
the counter and stamps the writer's id:

```ts
state.count = 5; // count's version: [1, 'k3j9x2']
state.count = 6; // count's version: [2, 'k3j9x2']
```

The write is broadcast as a **patch** — `{ key, value, version }` — and every
peer that receives one applies exactly one rule:

> Apply the patch only if its version is **newer** than mine:
> higher counter wins; equal counters break the tie by comparing client ids.

That rule (`newer()` in the API) is the _entire_ conflict story. It's
last-writer-wins per key, with a deterministic tie-break so every replica
picks the same winner. No coordinator, no election, no extra round trips.

## Watch it absorb the scary case

This is the part that kills split brain, so it's worth slowing down.
Tab A (`aaaaaa`) and tab B (`bbbbbb`) both hold `note` at version `[3, …]`,
and both write before either patch arrives:

| Moment  | Tab A                                                                | Tab B                                                     |
| ------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| write   | `note = "from A"` → `[4, aaaaaa]`                                    | `note = "from B"` → `[4, bbbbbb]`                         |
| receive | gets `[4, bbbbbb]` — same counter, `bbbbbb > aaaaaa` → **applies B** | gets `[4, aaaaaa]` — tie, `aaaaaa < bbbbbb` → **keeps B** |
| result  | `"from B"`                                                           | `"from B"`                                                |

Both tabs picked the same winner _without talking to each other_. And a
third tab receiving those two patches in **either order** also lands on
`"from B"` — convergence never depends on delivery order.

:::note What LWW means for you
Tab A's write was _discarded_, not merged. For a counter, a form field, or a
status flag, that's exactly right. For collaborative text editing it's not —
that problem needs CRDTs or OT, which is
[out of scope by design](./limitations.md#last-writer-wins-loses-concurrent-writes).
:::

## The late-joiner handshake

BroadcastChannel has no history: a message posted before you subscribed is
gone. So how does a freshly opened tab show the current count instead of
`0`?

```mermaid
sequenceDiagram
    participant C as New tab (joiner)
    participant A as Tab A
    participant B as Tab B
    C->>A: hello
    C->>B: hello
    A->>C: snapshot { state, versions }
    B->>C: snapshot { state, versions }
    Note over C: merge: apply every entry whose<br/>version is newer than mine
```

On creation, a store broadcasts `hello`. Every existing peer answers with a
**snapshot** — its full state plus all versions. The joiner runs each entry
through the same `newer()` rule it uses for live patches, so receiving three
overlapping snapshots is harmless: older entries simply lose.

And here's the subtle part: your initial value registers
at version `[0, myId]`. Anything a peer actually _wrote_ has a counter ≥ 1 —
and therefore beats it. Think about what that means:
`useSharedState('pay-status', 'idle')` in a brand-new tab hydrates to
`'processing'` if that's the truth out there. The initial value never stomps
a real one, and the duplicate-tab payment bug dies right here — the late
joiner's Pay button renders disabled from its very first frame.

:::tip
The same mechanism resolves the _initial values disagree_ case
deterministically: two fresh tabs with different initials converge on the
one whose client id sorts higher, at version 0, until someone actually
writes.
:::

## Presence: heartbeats with piggybacking

Presence answers "who else is here?" without any central registry:

- On joining a bus, a client broadcasts `hello`; existing peers reply with a
  `ping` so the joiner learns about everyone immediately.
- Every client pings every **2 seconds**.
- A peer silent for **5 seconds** is pruned — that's the crashed tab, which
  never gets to say goodbye.
- A closing tab broadcasts `bye` on `pagehide`, so clean exits disappear
  instantly instead of timing out.
- **Any** message from a peer — a state patch, an event — counts as a
  liveness signal, so busy tabs never flicker offline and chatty tabs pay no
  extra heartbeat cost.

Peers carry a `kind` (`'tab'` or `'worker'`, extensible), which is how the
demo renders workers as square dots and how `scope: 'tabs'` knows which
writes to ignore.

## The cross-origin handshake

The window channel has a different problem: the child page may take seconds
to load, and `postMessage` to a window that isn't listening yet is silently
lost. The solution is a retrying handshake with queueing on both sides:

```mermaid
sequenceDiagram
    participant O as Opener (shop)
    participant W as Child window (payment page)
    O->>W: window.open(url + ?ue-cid=nonce)
    Note over O: posts before ready are queued
    Note over W: page loads… connectToOpener()
    loop every 250ms until acked
        W->>O: ready (cid)
    end
    O->>W: ready-ack (cid)
    Note over O,W: both sides flush their queues
    O->>W: msg: order details
    W->>O: msg: progress
    W->>O: result (resolves opener's promise)
```

Nothing you `post()` before the handshake is dropped — it waits in a queue
and flushes on `ready`. If the handshake never completes (default 15s), both
`ready` and `result` reject with `HandshakeTimeoutError`; if the user closes
the window first, `result` rejects with `WindowClosedError` — detected by
both a `pagehide` signal from the child and a 400ms `window.closed` poll, so
even a crashed child is noticed promptly.

## Delivery guarantees, honestly

- **Latency**: BroadcastChannel delivery is typically sub-millisecond to a
  few milliseconds; it is an async task, never synchronous.
- **Ordering**: patches from one writer arrive in order; interleavings
  between writers are resolved by the clock, not by arrival order.
- **No echo**: your own posts are never delivered back to you — a channel
  handler only ever fires for _other_ clients' events.
- **At-most-once**: there is no ack or retry on the same-origin bus. If a
  tab is mid-refresh when an event fires, it misses it — use state, which
  re-hydrates, for anything that must survive that.

## Where to next

- [Security model](./security-model.md) — the four gates on every
  cross-origin message.
- [Limitations](./limitations.md) — the boundaries all of this machinery
  deliberately stays inside.
- [Testing](../guides/testing.md) — drive every mechanism on this page from
  a unit test with `MemoryHub`.
