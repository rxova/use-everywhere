---
title: 'structured-clone-safe'
description: 'Flags values in shared state that the structured clone algorithm cannot carry, before they fail quietly on the wire.'
sidebar:
  order: 4
---

**Recommended: error.** Flags values in shared state that the structured clone
algorithm cannot carry.

Checks the initial value of `useSharedState`, `useSharedReducer`,
`createSharedStore`, `createSharedReducer` and `store.registerKey`.

## Why

Everything that crosses a `BroadcastChannel` — or a `postMessage`, or an
IndexedDB write — is structured-cloned. Two things can go wrong, and they fail
differently.

**Uncloneable values throw.** A function, a symbol, a `Promise`, a `WeakMap`:

```tsx
// ✗ Throws on write, in this tab, at the line that set it.
useSharedState('cart', { items: [], onCheckout: () => {} });
```

The library pre-checks the value and throws before mutating locally, so the tab
does not diverge from its peers — but the write is lost and the error names the
key, not the property. Lint names the property.

**Class instances clone as plain objects.** This is the quieter one:

```tsx
// ✗ Arrives on the other side as { name: 'ada' } — no prototype, no methods.
useSharedState('user', new User('ada'));
```

Nothing throws. The writing tab has a `User`; every other tab has an object that
fails `instanceof` and has no methods, and the crash lands in whichever
component calls `user.displayName()` — a long way from the line that caused it.

`Date`, `Map`, `Set`, `RegExp`, `Error`, `ArrayBuffer`, `Blob`, `File` and the
typed arrays clone with their identity intact, and are not flagged.

## Correct

```tsx
useSharedState('cart', { items: [], total: 0, updatedAt: new Date() });

// Share data; keep behaviour local.
useSharedState('user', { name: 'ada' });
const user = useMemo(() => new User(shared.name), [shared.name]);
```

If tabs need to trigger behaviour in one another, send a message naming the
action rather than sharing the function that performs it — see
[Messages and presence](../guides/messages-and-presence.md).

## What it will not catch

The rule reads literals. A value it cannot see through — a variable holding an
object, a function call's result, a spread — goes unjudged:

```tsx
useSharedState('cart', buildInitialCart()); // not judged
```

The runtime pre-check still covers those; this rule catches them earlier, when
they are written down.

See [Serialization](../guides/serialization.md) for what happens on the wire, and
which types survive a round trip.
