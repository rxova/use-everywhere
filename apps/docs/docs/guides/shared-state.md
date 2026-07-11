---
sidebar_position: 1
---

# Shared state

`useSharedState` is `useState` with a bigger blast radius: the value lives in
every tab, window, and worker on your origin.

```tsx
const [note, setNote] = useSharedState('note', '');
```

## Choosing how far a value travels

The third argument delimits how much is shared:

```tsx
useSharedState('draft', '', { scope: 'everywhere' }); // tabs + windows + workers (default)
useSharedState('draft', '', { scope: 'tabs' }); // ignore writes from workers
useSharedState('draft', '', { scope: 'tab' }); // this tab only
```

- **`everywhere`** — synced across every context on the origin over BroadcastChannel.
- **`tabs`** — synced, but writes coming from workers are ignored.
- **`tab`** — never leaves the tab; still shared between components in it.

Each scope is an independent namespace: a `tab`-scoped `'draft'` and an
`everywhere`-scoped `'draft'` are different values.

## Namespacing with stores

Keys live inside a named store (default `'use-everywhere'`). Use `store` to
isolate feature areas:

```tsx
const [step] = useSharedState('step', 0, { store: 'checkout' });
```

## How conflicts resolve

Every key carries a `[counter, clientId]` version clock. Writes broadcast a
patch; receivers apply it only if it is newer (higher counter, ties broken
deterministically by client id). Concurrent writes in two tabs always converge
to the same value everywhere — last writer wins.

## Late joiners

A tab that opens later posts `hello`; existing peers answer with a snapshot of
state and versions, and the joiner merges anything newer than what it has. Your
initial value registers at version zero, so any value a peer has already
written beats it.

## Outside React

```ts
import { createSharedStore } from '@use-everywhere/core';

const store = createSharedStore('checkout', { step: 0 });
store.state.step++; // proxy writes sync everywhere
store.subscribe((key, value, meta) => console.log(key, value, meta.clientId));
```

In React code you can reach the same store the hooks use with
`getSharedStore(name, scope)` — handy for patch logs and imperative writes.
