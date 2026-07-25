---
title: 'useChannel'
sidebar:
  order: 3
---

`useChannel` hands you the typed event channel for a name. A channel is how
tabs tell each other that something _happened_ — "user logged out", "cart
changed, go refetch" — as opposed to shared state, which is about what
something _is_. You'll almost always use it together with
[`useMessage`](./use-message.md) (listen) and [`useSend`](./use-send.md)
(announce).

```tsx
import { useChannel } from 'use-everywhere';

type AuthEvents = {
  'logged-out': undefined;
  'session-renewed': { expiresAt: number };
};

function Session() {
  const channel = useChannel<AuthEvents>('auth');
  // …pass it to useMessage / useSend
}
```

## Signature

```ts
function useChannel<M extends MessageMap>(name: string): Channel<M>;
```

There are no options and no default — the `name` is required, because the
name _is_ the channel's identity across your whole origin. Every context that
calls `useChannel('auth')` (or `createChannel('auth')` outside React) is on
the same wire.

## The message map

The type parameter is a **message map**: event names to payload types. Declare
it once, export it, and every `post` and every handler is checked against it:

```ts title="events.ts"
export type ShopEvents = {
  'cart-updated': { items: number };
  'logged-out': undefined; // events with no payload use undefined
};
```

Misspell an event name or post the wrong payload shape, and TypeScript stops
you at the call site — in every tab's code at once, which is exactly where
you want a cross-tab contract enforced.

## Return value

The channel object itself, with two methods you'll rarely call directly in
components (the companion hooks wrap them):

- `channel.post(type, payload)` — broadcast an event to every _other_
  context on the origin.
- `channel.on(type, handler)` — subscribe; returns an unsubscribe function.

The returned channel is a page-wide singleton per name with **stable
identity** — the same object on every render, safe to put in dependency
arrays and to pass down as a prop without memoizing.

## Gotchas

- **Channels have no history.** An event posted before a tab subscribed is
  gone; a tab opened after `logged-out` fired never hears it. If a late
  joiner must know, it isn't an event — it's
  [state](./use-shared-state.md).
- **Your own posts don't echo back.** A channel handler only ever fires for
  _other_ clients' events. Update your own tab explicitly.
- **One channel per concern reads best.** `'auth'`, `'cart'`, `'sync'` —
  small typed maps per feature beat one giant app-wide map.
- **Using one channel from many components?** Bind the name and types once
  with [`defineChannel`](./define-channel.md) instead of repeating
  `useChannel<ShopEvents>('shop')` at every call site.

## Where to next

- [`useMessage`](./use-message.md) — subscribe to one event type from this
  channel.
- [`useSend`](./use-send.md) — a stable send function for it.
- [Messages & presence guide](../guides/messages-and-presence.md) — the trio
  working together in a real feature.
