---
'@use-everywhere/core': minor
---

Add `createNamespace(name)`, so two independently deployed apps on one origin cannot collide by both taking the defaults.

A `BroadcastChannel` is global to the origin, so a bus name _is_ an identity. Two micro-frontends that each call `createSharedStore('cart', …)` — or each omit the name and land on `DEFAULT_NAME` — are not two carts. They are one cart, with two teams writing to it, one leader seat contended between them, and one presence roster counting both. Nothing warned, and nothing could: from the library's side that is indistinguishable from the case it exists to serve.

"Prefix your names" was the workaround, and it fails the way conventions fail — silently, once, in whichever app forgot.

```ts
const checkout = createNamespace('checkout');
const cart = checkout.createSharedStore('cart', { items: [] }); // bus "checkout:cart"
```

The namespace carries every factory, not a reduced subset, and `busName()` exposes the real bus name for `observeBus`, `getTransportKind` and devtools. An empty namespace throws rather than silently putting everything back on the shared defaults.

Named `createNamespace` rather than `createScope` — which is what the roadmap and audit both called it — because "scope" was already taken twice: `wire.scope` says _which engine_ a wire belongs to, and the React package's share scope says _how far_ a value travels. Three axes, three words.

It prevents collision, not access: everything here is same-origin and a namespace is a string, so anything on the page can construct the same one deliberately.
