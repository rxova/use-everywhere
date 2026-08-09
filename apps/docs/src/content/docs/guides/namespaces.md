---
title: 'Namespaces for micro-frontends'
description: 'A BroadcastChannel is global to the origin, so a bus name is an identity. How to namespace keys so independently deployed micro-frontends cannot collide.'
sidebar:
  order: 8
---

A `BroadcastChannel` is global to the origin, so a bus name _is_ an identity.
Two independently deployed apps that both call `createSharedStore('cart', …)` —
or both omit the name and land on the default — are not two carts. They are one
cart, with two teams writing to it.

Nothing warns about this, and nothing can: from the library's side it is
indistinguishable from the case it exists to serve, two tabs sharing state.

```ts
import { createNamespace } from 'use-everywhere';

export const checkout = createNamespace('checkout');
```

Every name from that namespace is prefixed, so `checkout.useSharedState('items',
[])` lives on the bus `checkout:use-everywhere` and can't be reached by anything
that didn't ask for the `checkout` namespace by name.

## Using it

Call it **at module scope**, once per app, and export it:

```ts
// checkout/bus.ts
export const checkout = createNamespace('checkout');

// checkout/Cart.tsx
import { checkout } from './bus';

function Cart() {
  const [items, setItems] = checkout.useSharedState('items', []);
  const peers = checkout.usePeers();
  // …
}
```

It carries the full surface, not a reduced one — `useSharedState`, `usePeers`,
`useClientId`, `useLeader`, `useIsLeader`, `useLeaderEffect`, `defineStore`,
`defineChannel`, `getSharedStore`, plus the core factories (`createSharedStore`,
`createChannel`, `createPresence`, `createLeader`) for code outside React.

Options keep their meanings. A `store` or `name` you pass is a name _within_ the
namespace:

```ts
checkout.useSharedState('theme', 'dark', { store: 'settings' });
// bus "checkout:settings"
```

## Namespace is not scope

Three different words that all sound like "scope", kept deliberately distinct:

|                 | Question it answers                      | Example                       |
| --------------- | ---------------------------------------- | ----------------------------- |
| **Namespace**   | _Whose bus is this?_                     | `createNamespace('checkout')` |
| **Share scope** | _How far does this value travel?_        | `{ scope: 'tabs' }`           |
| `wire.scope`    | _Which engine does this wire belong to?_ | `'state'`, `'presence'`       |

They compose without interacting:

```ts
checkout.useSharedState('draft', '', { scope: 'tab' });
//        ^ the checkout app's bus     ^ but never leaves this tab
```

## What it does not do

**It is not a security boundary.** Everything here is same-origin, and a
namespace is a string — anything on the page can construct the same one
deliberately. It prevents _collision_, not _access_. For the cross-origin case,
see the [security model](../under-the-hood/security-model.md).

**It does not isolate you from version skew.** Two deploys of the _same_
namespace still meet, which is what you want — and if they speak different wire
protocols they partition loudly. See
[Version skew & the wire contract](../under-the-hood/version-skew.md).

## Finding the bus

`busName()` gives the real name, which is what devtools, `observeBus` and
`getTransportKind` want:

```ts
observeBus(checkout.busName('settings'), (event) => console.log(event));
// listens on "checkout:settings"
```

## Related

- [Validating payloads](./validating-payloads.md) — the other half of making two
  independently deployed apps safe to run together
- [Version skew & the wire contract](../under-the-hood/version-skew.md)
