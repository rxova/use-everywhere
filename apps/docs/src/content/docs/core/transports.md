---
title: 'Transports'
sidebar:
  order: 4
---

A transport is the wire an engine talks over. It's a three-method interface, and
swapping it is how you test without a browser, or turn syncing off entirely.

```ts
interface Transport {
  readonly kind?: TransportKind; // what this is, for diagnostics
  post(data: unknown): void;
  subscribe(fn: (data: unknown) => void): () => void;
  close(): void;
}
```

Pass a **factory**, not an instance — the engine gives it the bus name:

```ts
import { MemoryHub } from '@use-everywhere/core/testing';

createSharedStore('settings', {}, { transport: (name) => new MemoryHub().connect() });
```

## The five that ship

**`BroadcastChannelTransport`** — the real one. Same-origin, cross-tab,
cross-worker.

**`MemoryHub` + `MemoryTransport`** — the test seam, imported from
`@use-everywhere/core/testing` (or `use-everywhere/testing`), not the package
root. A hub is an in-process stand-in for the browser's channel: every
transport connected to it receives every _other_ transport's posts, on a
microtask, structured-cloned per delivery, with no self-echo — the exact
semantics of `BroadcastChannel`.

```ts
import { MemoryHub } from '@use-everywhere/core/testing';

const hub = new MemoryHub();
const options = { transport: () => hub.connect() };

const tabA = createSharedStore('checkout', { step: 0 }, options);
const tabB = createSharedStore('checkout', { step: 0 }, options);
// one connect() = one simulated tab
```

**`StorageTransport`** — the fallback, for browsers with no
`BroadcastChannel`. It rides a quirk of `localStorage`: writing to it fires a
`storage` event in every _other_ same-origin tab and never in the writer, which
is exactly the no-self-echo semantics the engines need. The entry is deleted
immediately after writing, so application state never lingers on disk.

One difference you must know about: **fidelity is JSON, not structured clone.**
`localStorage` holds strings, so a `Date` arrives as an ISO string and a `Map`
as `{}`. Values JSON cannot represent at all — functions, symbols — are
_rejected_ rather than silently dropped, so a write still cannot leave your tab
holding something its peers never received. Keep shared values JSON-shaped if
you support browsers that land here.

**`NoopTransport`** — swallows everything, receives nothing. This is how
`scope: 'tab'` works: a store that never leaves the tab is just a store on a
transport that goes nowhere.

**`defaultTransport(name)`** — walks the chain: `BroadcastChannelTransport`,
then `StorageTransport`, then `NoopTransport`. Falling back is not silent: both
degradations warn in development, because a library that quietly shares nothing
looks exactly like one that is working.

## Is anything actually connected?

The question worth being able to answer when nothing syncs and the code looks
right:

```ts
import { getTransportKind } from 'use-everywhere';

getTransportKind('use-everywhere');
// 'broadcast-channel' | 'storage' | 'none' | 'custom' | null
```

`'none'` means writes stay in this tab and no peer will ever see them — usually
blocked storage in a sandboxed iframe, or third-party cookies disabled. `null`
means no bus exists for that name yet.

It is a plain function rather than a hook, because a bus chooses its transport
once when it is created and keeps it for the life of the page. There is nothing
to subscribe to. `isBroadcastChannelAvailable()` and `isStorageEventAvailable()`
answer the same question before a bus exists.

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
