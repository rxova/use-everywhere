---
'use-everywhere': minor
---

Add `useSharedStore(selector, options)` — derived reads without whole-store re-renders.

`useSharedState` subscribes to one key, which is the right shape for reading one thing. Reading _across_ keys meant either one hook per key, or a subscription to the whole store — and the latter re-renders on every write to anything in it.

```tsx
const total = useSharedStore<Cart, number>((cart) => cart.items.length + cart.saved.length);
```

The selector runs on every store change; the component re-renders only when the result changes. `equal` chooses how that is decided (default `Object.is`), and **`shallowEqual` is exported** for the common case of a selector that builds an object or array — those produce a new reference every run, so without an equality function they defeat the very optimisation they were reached for.

A selector defined inline is a new function on every render, and that is fine: the subscription is not torn down, and the cache keys on the selector as well as the store snapshot, so a _changed_ selector never returns the previous one's answer.

**It reads; it does not declare.** `useSharedState(key, initial)` registers a key with a default. A selector sees whatever is in the store, so a key nothing has registered or written yet is `undefined` — write selectors that tolerate that, or declare the defaults somewhere that mounts first. The same applies on a server, where the store is inert and empty and the selector runs against `{}`.

Namespaces carry it too: `checkout.useSharedStore(…)` selects from the namespaced store.
