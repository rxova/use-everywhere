---
'use-everywhere': minor
---

`createNamespace(name)` returns namespaced **hooks** as well as factories.

The core namespace prefixes bus names; this is the half a React app actually uses. Call it at module scope, once per app, and export it:

```ts
// checkout/bus.ts
export const checkout = createNamespace('checkout');

// anywhere in the checkout app
const [items, setItems] = checkout.useSharedState('items', []);
```

It carries the full surface — `useSharedState`, `usePeers`, `useClientId`, `useLeader`, `useIsLeader`, `useLeaderEffect`, `defineStore`, `defineChannel`, `getSharedStore` — plus the core factories underneath, for code outside React.

Options keep their meanings: a `store` or `name` you pass is a name _within_ the namespace, and `scope` still says how far a value travels, which is a different axis entirely. `checkout.useSharedState('draft', '', { scope: 'tab' })` reads as the checkout app's bus, but never leaving this tab.

Module scope matters: the namespace is a small object of bound functions, and rebuilding it every render would hand React a new `useSharedState` identity each time.

New **Namespaces for micro-frontends** guide, including a table of the three things in this library that sound like "scope" and why they stay distinct.
