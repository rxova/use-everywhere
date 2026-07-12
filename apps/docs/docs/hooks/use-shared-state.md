---
sidebar_position: 2
---

# useSharedState

`useSharedState` is `useState` with a bigger blast radius: the value lives in
every tab, window, and worker on your origin, writes converge everywhere
within milliseconds, and a tab opened later hydrates to the current value
instead of the initial one.

```tsx
import { useSharedState } from 'use-everywhere';

function Counter() {
  const [count, setCount] = useSharedState('count', 0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

Render that in five tabs and click any button: all five update. Underneath
it's a versioned patch, a broadcast, and a deterministic merge rule on every
peer — the details live in
[How sync works](../under-the-hood/how-sync-works.md), but you don't need
them to use it.

## Signature

```ts
function useSharedState<T>(
  key: string,
  initial: T,
  options?: UseSharedStateOptions,
): [T, (next: T | ((prev: T) => T)) => void];
```

Exactly the `useState` tuple: the current value, and a setter that accepts
either a value or an updater function.

## Options

| Option  | Type                              | Default            | What it does                                                                      |
| ------- | --------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `store` | `string`                          | `'use-everywhere'` | Which named store the key lives in — a namespace, so feature areas can't collide. |
| `scope` | `'everywhere' \| 'tabs' \| 'tab'` | `'everywhere'`     | How far the value travels (see below).                                            |

### `store` — namespacing your keys

Keys live inside a named store. Two features can both use a `'step'` key
without ever colliding, as long as they use different stores:

```tsx
const [step] = useSharedState('step', 0, { store: 'checkout' });
const [step2] = useSharedState('step', 0, { store: 'onboarding' }); // unrelated value
```

If you don't control the whole origin (micro-frontends, embedded widgets),
prefix your store names — `'myapp:cart'` — so another app's `'cart'` can't
interfere.

### `scope` — choosing the blast radius

```tsx
useSharedState('draft', '', { scope: 'everywhere' }); // tabs + windows + workers (default)
useSharedState('draft', '', { scope: 'tabs' }); // ignore writes coming from workers
useSharedState('draft', '', { scope: 'tab' }); // this tab only
```

- **`everywhere`** — synced across every context on the origin.
- **`tabs`** — still synced across tabs and windows, but patches originating
  from workers are silently dropped. Useful when a worker feeds data you
  _sometimes_ don't want.
- **`tab`** — a no-op transport: nothing leaves, nothing arrives. Every
  component in the tab using that key still shares one value, so it's a
  zero-Provider way to share state within a tab.

One thing to internalize: **scope is part of the identity.** The same key in
`'tab'` and `'everywhere'` scopes is two different values, on purpose.

## Worked example: a payment status every tab agrees on

The duplicate-tab payment bug, solved with one hook:

```tsx title="PayButton.tsx"
import { useSharedState } from 'use-everywhere';

type PayStatus = 'idle' | 'processing' | 'paid';

function PayButton() {
  const [status, setStatus] = useSharedState<PayStatus>('pay-status', 'idle', {
    store: 'checkout',
  });

  const pay = async () => {
    setStatus('processing'); // every tab's button disables right now
    await chargeCard();
    setStatus('paid'); // every tab shows the receipt state
  };

  return (
    <button onClick={pay} disabled={status !== 'idle'}>
      {status === 'idle' ? 'Pay' : status === 'processing' ? 'Processing…' : 'Paid ✓'}
    </button>
  );
}
```

The part that matters: a tab opened _while_ the payment is processing renders
`'processing'` from its very first frame — not `'idle'` — because its initial
value never overrides a value another tab actually wrote. That's the whole
class of bug, gone. (For the full pattern with an owner id, see the
[single-flight recipe](../guides/recipes.md#the-duplicate-tab-lock-single-flight).)

## Gotchas

- **Initial values never win over real writes.** Your `initial` registers at
  version zero; anything a peer actually wrote has a higher version and beats
  it. First mount registers the initial, later mounts reuse it — so two tabs
  with different initials converge deterministically too.
- **Concurrent writes to the same key: one wins, one is discarded.**
  Last-writer-wins with a deterministic tie-break. Perfect for flags,
  counters, form fields; wrong for collaborative text editing — that's
  [CRDT territory](../under-the-hood/limitations.md#last-writer-wins-loses-concurrent-writes).
- **Values must survive structured clone.** Plain objects, arrays, `Map`,
  `Set`, `Date`, typed arrays: fine. Functions, class instances, DOM nodes,
  React elements: not fine.
- **Nothing is persisted.** Close the last tab and the value is gone. To keep
  it, write through to `localStorage` and pass the stored value as `initial`
  — [the pattern](../under-the-hood/limitations.md#state-does-not-survive-the-last-tab--unless-you-ask-it-to).
- **Subscriptions are per key.** Components using the same key (and store and
  scope) share one subscription, and a `note` update never re-renders `count`
  consumers.
- **SSR renders `initial`.** On the server the hook returns your initial
  value; after hydration the client converges to the shared value.

## Outside React

`getSharedStore(name?, scope?)` returns the exact store instance the hook
uses — handy for patch logs, event handlers outside components, or writes
from non-React code:

```ts
import { getSharedStore, DEFAULT_NAME } from 'use-everywhere';

const store = getSharedStore(DEFAULT_NAME);
store.set('count', (prev) => (prev ?? 0) + 1);
store.subscribe((key, value, meta) => console.log(key, value, meta.clientId));
```

## Where to next

- [Shared state guide](../guides/shared-state.md) — scopes, stores, and
  conflict behavior as a walkthrough.
- [How sync works](../under-the-hood/how-sync-works.md) — the version clocks
  and handshakes underneath.
- [`useMessage`](./use-message.md) — for things that _happen_ rather than
  things that _are_.
