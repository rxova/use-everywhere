---
title: 'Transports'
sidebar:
  order: 4
---

A transport is the wire an engine talks over. It's a three-method interface, and
swapping it is how you test without a browser, or turn syncing off entirely.

```ts
interface Transport {
  post(data: unknown): void;
  subscribe(fn: (data: unknown) => void): () => void;
  close(): void;
}
```

Pass a **factory**, not an instance — the engine gives it the bus name:

```ts
createSharedStore('settings', {}, { transport: (name) => new MemoryHub().connect() });
```

## The four that ship

**`BroadcastChannelTransport`** — the real one. Same-origin, cross-tab,
cross-worker.

**`MemoryHub` + `MemoryTransport`** — the test seam. A hub is an in-process
stand-in for the browser's channel: every transport connected to it receives
every _other_ transport's posts, on a microtask, with no self-echo — the exact
semantics of `BroadcastChannel`.

```ts
const hub = new MemoryHub();
const options = { transport: () => hub.connect() };

const tabA = createSharedStore('checkout', { step: 0 }, options);
const tabB = createSharedStore('checkout', { step: 0 }, options);
// one connect() = one simulated tab
```

**`NoopTransport`** — swallows everything, receives nothing. This is how
`scope: 'tab'` works: a store that never leaves the tab is just a store on a
transport that goes nowhere.

**`defaultTransport(name)`** — picks `BroadcastChannelTransport` when the API
exists, `NoopTransport` when it doesn't. That's the SSR and old-browser story:
nothing throws, the state simply stays local. `isBroadcastChannelAvailable()`
tells you which you got.

## Injecting a transport bypasses the registry

Worth knowing, because it's the whole reason the test idiom works:

```ts
getBus('x'); // shared: the registry hands back one bus per name
getBus('x', { transport: … }); // isolated: a brand-new bus, every call
```

So with a custom transport, **each `create*` call is one independent simulated
client**, with its own `clientId` — even inside a single process. Without one,
engines with the same name share a bus, as they must.

## Writing your own

Anything that can carry a structured-cloneable value both ways will do — a
`SharedWorker`, a WebSocket relay, an `EventTarget` shim. Two rules:

1. **Never echo to the sender.** Every engine assumes it will not hear its own
   posts. (The bus drops self-echoes defensively, but don't rely on it.)
2. **Deliver asynchronously.** Synchronous delivery makes re-entrancy bugs that
   `BroadcastChannel` would never have produced.

Cross-_device_ sync is deliberately out of scope — see
[Limitations](../under-the-hood/limitations.md). A transport that reached a
server would break the security model the cross-origin channel is built on.
