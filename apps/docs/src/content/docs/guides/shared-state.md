---
title: 'Shared state'
description: 'Shared state beyond the counter: choosing how far a value travels, namespacing keys so features cannot collide, and watching two tabs converge.'
sidebar:
  order: 1
---

Let's take shared state beyond the counter. In this guide we'll pick how far
a value travels, namespace keys so features can't collide, watch two tabs
fight over one key (and agree anyway), and reach the same state from code
that isn't React. If you want the raw API surface instead, that's
[`useSharedState`](../hooks/use-shared-state.md).

Everything starts from one line:

```tsx
const [note, setNote] = useSharedState('note', '');
```

`useState` with a bigger blast radius: the value lives in every tab, window,
and worker on your origin.

## Choose how far a value travels

Not every value should reach everywhere. The `scope` option delimits the
blast radius:

```tsx
useSharedState('draft', '', { scope: 'everywhere' }); // tabs + windows + workers (default)
useSharedState('draft', '', { scope: 'tabs' }); // ignore writes from workers
useSharedState('draft', '', { scope: 'tab' }); // this tab only
```

- **`everywhere`** — synced across every context on the origin. The default,
  and right for most things.
- **`tabs`** — synced, but writes coming from workers are silently ignored.
  Useful when a worker feeds a store that the UI _sometimes_ wants to
  override locally.
- **`tab`** — never leaves the tab, but still shared between every component
  in it. A zero-Provider way to share state within one page.

Each scope is an independent namespace: a `tab`-scoped `'draft'` and an
`everywhere`-scoped `'draft'` are different values. **Scope is part of the
identity** — nothing ever bleeds between scopes by accident.

## Namespace keys with stores

Keys live inside a named store (default `'use-everywhere'`). Give each
feature area its own store and stop thinking about key collisions:

```tsx
const [step] = useSharedState('step', 0, { store: 'checkout' });
const [step2] = useSharedState('step', 0, { store: 'onboarding' }); // unrelated
```

Sharing an origin with code you don't control (micro-frontends, embedded
apps)? Prefix the store name — `'myapp:checkout'` — because same origin +
same name = same bus, for everyone.

## Watch a conflict resolve

Here's the scenario that scares people off cross-tab state, so let's walk
straight into it. Tab A and tab B both write `note` in the same millisecond:

| Moment  | Tab A (`aaaaaa`)                               | Tab B (`bbbbbb`)                 |
| ------- | ---------------------------------------------- | -------------------------------- |
| write   | `note = "from A"`                              | `note = "from B"`                |
| receive | B's write is "newer" (tie-break) → **shows B** | A's write is older → **keeps B** |
| result  | `"from B"`                                     | `"from B"`                       |

Every key carries a version clock; every peer applies the same deterministic
rule (higher counter wins, ties broken by client id); every tab lands on the
same value — with no coordinator and no extra round trips. A third tab
receiving the patches in _either_ order also lands on `"from B"`. The full
mechanics are in [How sync works](../under-the-hood/how-sync-works.md).

The honest cost: tab A's write was **discarded**, not merged. For flags,
counters, form fields, wizard steps — exactly what you want. For two people
typing in one document — wrong tool; that's
[CRDT territory](../under-the-hood/limitations.md#last-writer-wins-loses-concurrent-writes).
Writes to _different keys_ never conflict at all, so splitting state across
keys is the cheap way to avoid collisions entirely.

## Trust the late joiner

Open a new tab mid-session and it renders the current state from its first
paint. You don't write any code for this — but it's worth knowing why it
works, because it's the part that kills the duplicate-tab-payment class of
bug:

1. The new tab broadcasts `hello`; **one** existing peer answers with a
   snapshot of state and versions.
2. Your `initial` value registers at version zero.
3. Anything a peer actually _wrote_ has a higher version — so it beats your
   initial, always.

`useSharedState('pay-status', 'idle')` in a fresh tab hydrates to
`'processing'` if that's the truth out there. The initial value never stomps
a real one.

**One peer, not all of them.** Peers wait a short jittered moment and the
first snapshot to land cancels the rest, so joining a busy origin costs one
copy of the state rather than one per tab already open. A peer with nothing
written stays quiet entirely — an empty snapshot would only crowd out a tab
that has something real. The trade is that hydration takes a few tens of
milliseconds instead of a single round trip; `snapshotDelayMs` on the core
store tunes it.

## Reach the state from outside React

Workers, plain modules, event handlers outside components — the core engine
is the same one the hooks use:

```ts title="anywhere.ts"
import { createSharedStore } from '@use-everywhere/core';

const store = createSharedStore('checkout', { step: 0 });
store.state.step++; // proxy writes sync everywhere
store.set('step', (prev) => prev + 1); // functional updates too
store.subscribe((key, value, meta) => {
  console.log(key, value, meta.clientId, meta.self ? '(me)' : '(other tab)');
});
```

And in React code, `getSharedStore(name, scope)` returns the exact store
instance the hooks use — handy for patch logs and imperative writes:

```ts
import { getSharedStore, DEFAULT_NAME } from 'use-everywhere';

getSharedStore(DEFAULT_NAME).set('count', 0); // resets every tab's counter
```

## Replace values, don't mutate them

Shared state syncs on **replacement**, not mutation. Assigning a value — a
setter call, `store.set(...)`, or a whole-value write through the proxy —
bumps the key's version clock and broadcasts it. Reaching _inside_ a value
and changing it in place does not:

```ts
store.set('cart', { items: 2 }); // ✅ syncs — new value, new version
store.state.cart.items = 3; // ❌ silently local — no version bump, no broadcast
```

The `state` proxy is shallow, so a nested write never reaches the trap that
would version and broadcast it; the value just diverges between tabs. The fix
is always the same — build the next value and assign it:

```ts
const [cart, setCart] = useSharedState('cart', { items: 0 });
setCart({ ...cart, items: cart.items + 1 }); // ✅ replace, never mutate
```

To make the mistake impossible to miss, **shared values are deep-frozen in
development**, so an accidental in-place mutation throws a `TypeError` right at
the offending line instead of failing quietly. Production builds strip the
freeze entirely — it costs you nothing shipped. (Same discipline as Redux
state; the reasoning is [structured clone](../under-the-hood/limitations.md):
values must be plain data anyway.)

## Read across keys without re-rendering on all of them

`useSharedState` subscribes to one key. Reading three keys means three hooks —
fine — but reading something _derived_ from them used to mean subscribing to
the whole store, which re-renders on every write to anything in it.

```tsx
const total = useSharedSelector<Cart, number>((cart) => cart.items.length + cart.saved.length);
```

The selector runs on every change; the component re-renders only when the
result differs. A selector that builds an object or array needs an equality
function, because it returns a new reference every run:

```tsx
import { shallowEqual } from 'use-everywhere';

const who = useSharedSelector((s) => ({ first: s.first, last: s.last }), { equal: shallowEqual });
```

**A selector reads; it does not declare.** Unlike `useSharedState(key, initial)`,
it registers nothing — a key nobody has written yet is `undefined`. Handle that
in the selector, or declare the defaults with `useSharedState` somewhere that
mounts first.

## Change several keys at once

Each `set` notifies subscribers, so writing three keys in a row re-renders
three times — and a subscriber reading the store between them sees a state
you never intended.

`transaction` groups them:

```ts
const store = getSharedStore('profile');

store.transaction(() => {
  store.set('firstName', 'Ada');
  store.set('lastName', 'Lovelace');
});
```

Subscribers are told about each changed key, but only after every write has
landed — so none of them ever observes half the group.

It is **local batching, not a distributed transaction.** Each write is still
its own patch on the wire, and another tab may see them arrive separately.
Making them atomic across tabs would need a message older deploys silently
ignore, which is a worse problem than the one it solves.

## Where to next

- [`useSharedState`](../hooks/use-shared-state.md) — the full option and
  gotcha reference for the hook.
- [Recipes](./recipes.md) — the duplicate-tab lock, the live draft, and the
  worker engine, built from this page's pieces.
- [How sync works](../under-the-hood/how-sync-works.md) — version clocks and
  handshakes, step by step.
