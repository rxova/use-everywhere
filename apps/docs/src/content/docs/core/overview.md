---
title: 'Core without React'
description: '@use-everywhere/core is the framework-agnostic engine behind the hooks — everything callable from a worker, a plain script or another framework.'
sidebar:
  order: 1
---

The hooks are a thin React skin over an engine that doesn't know React exists.
This section documents that engine — everything you can call from a worker, a
plain module, a test, or another framework.

You already have it. `use-everywhere` re-exports the whole of
`@use-everywhere/core`, so there is one dependency either way:

```ts
import { createSharedStore, newer } from 'use-everywhere';
// identical to:
import { createSharedStore, newer } from '@use-everywhere/core';
```

Install `@use-everywhere/core` directly only if you have no React at all.

Test seams live on a `testing` subpath rather than the package root, so a
multi-tab simulation harness never reaches your production bundle:

```ts
import { MemoryHub } from 'use-everywhere/testing';
// identical to:
import { MemoryHub } from '@use-everywhere/core/testing';
```

## What lives where

|                                                                                                |                                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Hooks** — `useSharedState`, `useLeader`, …                                                   | [Hooks](../hooks/overview.md)                                                             |
| **Factories** — `defineChannel`, `createStoreHooks`                                            | [Hooks](../hooks/overview.md) — they _return_ hooks, so they're documented alongside them |
| **Engines** — `createSharedStore`, `createChannel`, `createPresence`, `createLeader`           | [Engines](./engines.md)                                                                   |
| **Version clock** — `newer`, `Version`                                                         | [The version clock](./clock.md)                                                           |
| **Transports** — `NoopTransport`, `BroadcastChannelTransport` (plus `MemoryHub` on `/testing`) | [Transports](./transports.md)                                                             |
| **Debug seam** — `observeBus`, `enableDebug`, `getBusNames`                                    | [Debugging](./debugging.md)                                                               |
| **Escape hatches** — `getSharedStore`, `getLeader`, `DEFAULT_NAME`, the error classes          | [Escape hatches](./escape-hatches.md)                                                     |
| **Cross-origin windows** — `openWindow`, `connectToOpener`                                     | [useWindowResult](../hooks/use-window-result.md)                                          |
| **Persistence adapters** — `localStorageAdapter`, `webStorageAdapter`                          | [createStoreHooks](../hooks/create-store-hooks.md)                                        |

Every signature is also generated from the source in the
[API reference](../api/core/README.md). This section is the prose; that one is
the exhaustive list.

## The one rule

An engine is a **resource**, not a value. It holds a bus, a heartbeat, and
listeners, so whatever you create, you close:

```ts
const store = createSharedStore('settings', { theme: 'dark' });
// …later
store.close();
```

The React hooks handle this for you — they memoise one engine per name for the
lifetime of the page, which is why there's no Provider and no cleanup to write.
Outside React, it's yours.

Engines sharing a name share a **bus**, and therefore share one `clientId` and
one underlying `BroadcastChannel`:

```ts
const store = createSharedStore('app', {});
const presence = createPresence('app');

store.clientId === presence.clientId; // true — same tab, same identity
```

That's why presence works even in a tab that never created a `Presence`: the
heartbeat lives on the bus, not on the engine.
