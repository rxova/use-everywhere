---
title: 'Benchmarks'
description: 'What use-everywhere costs over a raw BroadcastChannel, measured rather than asserted.'
sidebar:
  order: 6
---

The honest question about a library like this is not "is it fast" — it is **what
does it cost over doing it yourself**. Every number here is the library measured
against a raw `BroadcastChannel` doing the same work in the same run, because
that is the thing you would otherwise write.

Run them yourself:

```sh
pnpm run bench          # measure and print
pnpm run bench:check    # measure and fail on a budget
```

## What it costs

Measured on Node's `BroadcastChannel` — the same API a browser exposes, and the
one the default transport uses. Absolute numbers depend on the machine; the
ratios are what hold.

| Benchmark                               | Library  | Raw channel | Ratio |
| --------------------------------------- | -------- | ----------- | ----- |
| Write → 5 peers applied it (p50)        | 0.073 ms | 0.040 ms    | 1.8×  |
| Write → 5 peers applied it (p95)        | 0.125 ms | 0.060 ms    | 2.1×  |
| Channel throughput (messages/second)    | ~88,000  | ~272,000    | 0.32× |
| Snapshots answering one joiner, 20 tabs | 2        | —           | —     |

Read that as: a shared write costs **under twice** a hand-rolled post, and buys
last-writer-wins ordering with per-key version clocks, an envelope a peer on
another build can still read, and presence tracking on the same connection. The
channel gives up more — a third of raw throughput — because every message
carries that envelope and, if you asked for one, a schema check.

## Against the incumbent

The [`broadcast-channel`](https://www.npmjs.com/package/broadcast-channel)
package is the closest thing to a competitor, and the suite now measures it.

| Benchmark                            | Library | `broadcast-channel` | Ratio |
| ------------------------------------ | ------- | ------------------- | ----- |
| Channel throughput (messages/second) | ~86,000 | ~202,000            | 0.43× |

**It is faster at this, and that is the honest number.** Sending a message there
costs less because less travels: this library puts an envelope, a client id and
(if you asked for one) a schema check on every message, which is what makes the
same wire carry state, presence, version clocks and cross-version interop. You
are paying roughly two messages in five for the things a bare channel does not
do. If all you want is a channel, that is a real argument for a bare channel.

Making the comparison fair is most of the work, and three decisions move the
number:

- **The same primitive underneath.** It is pinned to `type: 'native'`, so both
  sides sit on the same `BroadcastChannel`. Left alone it would pick its
  filesystem-backed IPC under Node, and that would measure Node's filesystem.
- **No leader election on either side.** Opt-in there, opt-in here, off in both.
- **Its `postMessage` returns a promise.** Awaiting each one in turn would turn
  a burst into a round-trip per message and flatter nobody honestly, so the
  burst is fired and awaited together.

The gate's floor is 0.3 rather than the measured 0.43 — headroom for a loaded
runner, tight enough that losing another third of the throughput fails.

## The one that is not a ratio

The last row is the storm. Every joining tab says hello, and the question is how
many peers answer. Before the single-responder election, all of them did: twenty
tabs meant twenty full snapshots for one newcomer, and N tabs meant N² snapshot
applications.

It is counted in messages rather than milliseconds on purpose. The reply is
delayed by a jittered pause — that pause is exactly what turns N replies into
one — so wall time is dominated by a constant that would hide the regression
this exists to catch. Counting the snapshots that actually land is exact, free
of runner noise, and _is_ the property: one joiner, one snapshot, however large
the crowd. (The suite measures two, not one: a genuine race lets a second reply
out before the first cancels it.)

## Why the gate is scheduled, not per-PR

A hosted runner is shared, throttled, and a different machine every time. An
absolute millisecond budget on one produces red builds that mean nothing, which
is how a team learns to ignore a gate.

So every budget is a ratio measured in the same run — a slow runner slows the
baseline too — and the job runs weekly rather than on every pull request. What
it catches is structural: a loop that became per-peer, a snapshot reply that
became unconditional. Those do not creep in quietly between Mondays.

Each budget carries the reason for its number, printed when it fails:

```
✖ storm.snapshots-at-20: 20.00 ≤ 5
    One joiner, one snapshot — however large the crowd. Twenty peers answering
    a single hello is the O(K²) storm the single-responder election exists to
    prevent…
```

## What is not measured yet

The comparison above covers message throughput on a matched primitive. It does
**not** cover the two libraries' fallback modes against each other — its
`localstorage` and `simulate` types against this library's storage transport —
or its leader election against this one's. Those are separate benchmarks with
separate fairness problems, and claiming a winner on throughput alone would be
the kind of chart that makes people distrust charts.

Nothing here measures a real browser either. `BroadcastChannel` in Node is the
same shape but not the same implementation, and structured clone across a real
process boundary is not free in the same way. Treat these as the shape of the
overhead, not a promise about a specific engine.
