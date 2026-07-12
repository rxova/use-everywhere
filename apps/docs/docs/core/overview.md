---
sidebar_position: 1
---

# Core without React

The hooks are a thin React skin over an engine that doesn't know React exists.
This section documents that engine — everything you can call from a worker, a
plain module, a test, or another framework.

You already have it. `use-everywhere` re-exports the whole of
`@use-everywhere/core`, so there is one dependency either way:

```ts
import { createSharedStore, newer, MemoryHub } from 'use-everywhere';
// identical to:
import { createSharedStore, newer, MemoryHub } from '@use-everywhere/core';
```

Install `@use-everywhere/core` directly only if you have no React at all.

## What lives where

|                                                                                       |                                                                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Hooks** — `useSharedState`, `useLeader`, …                                          | [Hooks](../hooks/overview.md)                                                             |
| **Factories** — `defineChannel`, `defineStore`                                        | [Hooks](../hooks/overview.md) — they _return_ hooks, so they're documented alongside them |
| **Engines** — `createSharedStore`, `createChannel`, `createPresence`, `createLeader`  | [Engines](./engines.md)                                                                   |
| **Version clock** — `newer`, `Version`                                                | [The version clock](./clock.md)                                                           |
| **Transports** — `MemoryHub`, `NoopTransport`, `BroadcastChannelTransport`            | [Transports](./transports.md)                                                             |
| **Debug seam** — `observeBus`, `enableDebug`, `getBusNames`                           | [Debugging](./debugging.md)                                                               |
| **Escape hatches** — `getSharedStore`, `getLeader`, `DEFAULT_NAME`, the error classes | [Escape hatches](./escape-hatches.md)                                                     |
| **Cross-origin windows** — `openWindow`, `connectToOpener`                            | [useOpenedWindow](../hooks/use-opened-window.md)                                          |
| **Persistence adapters** — `localStorageAdapter`, `webStorageAdapter`                 | [defineStore](../hooks/define-store.md)                                                   |

Every signature is also generated from the source in the
[API reference](../api/core/index.md). This section is the prose; that one is
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
