---
title: 'Workers'
sidebar:
  order: 4
---

A Web Worker is another thread on your origin, and as far as this library is
concerned that makes it another peer. It joins the same bus as your tabs, writes
to the same store, and shows up in `usePeers()` — no bridge, no `postMessage`
protocol of your own, no relaying through the page that spawned it.

That last part is the one worth pausing on. A worker's writes reach **every tab**,
not just the page that created it. There is no parent-child relationship on the
bus: a worker spawned by tab A is visible to tab B, which cannot even reach it
directly.

## The whole integration

```ts
// tick-worker.ts
import { createSharedStore } from '@use-everywhere/core';

const store = createSharedStore('use-everywhere', { workerTicks: 0 });

setInterval(() => store.set('workerTicks', (t) => t + 1), 1000);
```

```tsx
// any component, in any tab
const [ticks] = useSharedState('workerTicks', 0);
```

That is the entire thing. Same store name, same values, and the counter moves in
every open tab.

## It knows it is a worker

You do not have to say so. `kind` is inferred from the absence of `document`, so
a worker announces itself as `'worker'` and tabs as `'tab'`:

```tsx
const peers = usePeers();
const workers = peers.filter((peer) => peer.kind === 'worker');
```

Pass `kind` explicitly only when the inference is wrong for your setup — a worker
that should present as a tab, or code running under Node in a test.

### Ignoring what workers write

Sometimes a worker feeds data that only some views want. `scope: 'tabs'` accepts
writes from tabs and windows and silently drops writes from workers:

```tsx
useSharedState('draft', '', { scope: 'tabs' });
```

## Leaving: the part that actually matters

A worker has two exits, and only one of them is polite.

**Asked to stop.** The worker closes its store, which announces `bye`, and peers
drop it in one round trip:

```ts
// in the worker
onmessage = () => {
  clearInterval(timer);
  store.close(); // says goodbye
  close();
};
```

```ts
// in the page
worker.postMessage('stop');
```

**Terminated.** `worker.terminate()` stops the thread mid-instruction. Nothing
runs, so nothing is announced — and there is no event on the page side either.
**The platform gives no notification that a worker has died.** No `pagehide`, no
`onterminate`, nothing to listen for.

So the peer does not disappear on a message; it disappears when presence stops
getting an answer. A quiet peer is probed, and dropped if the probe goes
unanswered — about six seconds by default
(`pruneAfterMs` + `probeGraceMs`, see [`usePeers`](../hooks/use-peers.md)).

The end-to-end behaviour, measured in a real browser by the `worker.spec.ts`
suite:

| Exit                  | Peer disappears after |
| --------------------- | --------------------- |
| `postMessage('stop')` | ~1s (one round trip)  |
| `worker.terminate()`  | ~7s (probe + timeout) |

Neither is a bug. If a terminated worker vanished instantly, it would mean
presence was treating silence as death — which is exactly what makes backgrounded
tabs flicker in and out of the roster. The cost of not doing that is a few
seconds of a dot that is already gone.

**So: prefer cooperative shutdown when the timing is visible to a user**, and let
`terminate()` be the fallback for a worker that is wedged. If you want both,
ask nicely and terminate on a timer:

```ts
worker.postMessage('stop');
setTimeout(() => worker.terminate(), 1000);
```

## Two things that do not work in a worker

**No storage-event fallback.** Workers have no `localStorage`, so the fallback
transport is unavailable there. A worker needs `BroadcastChannel` — which every
browser that supports workers meaningfully also supports, but it means a worker
on a browser without it is isolated rather than degraded. `getTransportKind()`
reports `'none'` in that case, and the library warns in development.

**Persistence silently does nothing.** `localStorageAdapter` and
`sessionStorageAdapter` resolve to nothing in a worker. This is not an error —
persistence is best-effort by contract, so it degrades to a no-op, and because
nothing _throws_, even `onError` stays quiet. Persist from a tab, not a worker.

## SharedWorker and Service Workers

A `SharedWorker` can join the bus like any other context, because it runs
`BroadcastChannel` too — and since 0.9 it can also **be** the wire, through
[`SharedWorkerTransport`](../core/transports.md#one-worker-instead-of-n-tabs).

The reason to reach for it is not speed. It is that a SharedWorker is a place
that is not a tab: something that owns the WebSocket, holds the poll interval,
or talks to the server exactly once, and does not disappear when the user closes
the tab that happened to be elected leader. With the relay in place, "the leader
owns the socket" becomes "the worker owns the socket", and leadership stops
being load-bearing for that job.

It stays opt-in, and `BroadcastChannel` stays the default: the transport needs a
script URL your app serves, does not exist inside a dedicated worker or on
Chrome for Android, and buys nothing for plain fan-out between tabs.

Service Workers are a different shape again: they are killed and restarted at the
browser's discretion, so a Service Worker is a poor holder of anything the rest of
the origin depends on being present.
