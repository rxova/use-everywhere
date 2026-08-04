---
title: 'Messages & presence'
sidebar:
  order: 2
---

Shared state is for what something _is_; messages are for what just
_happened_. In this guide we'll build the two features that teach the
difference: a cart badge that every tab keeps current, and a "who else is
here" strip. Along the way you'll hit the one behavior that surprises
everyone once — no echo — and see why it's a feature.

## Declare the contract once

A channel is typed by a **message map** — event names to payload shapes.
Declare it once, bind it to a name with
[`defineChannel`](../hooks/define-channel.md), and every tab speaks the same
language with nothing to repeat at call sites:

```ts title="shop-channel.ts"
import { defineChannel } from 'use-everywhere';

export type ShopEvents = {
  'cart-updated': { items: number };
  'logged-out': undefined; // no payload
};

export const shop = defineChannel<ShopEvents>('shop');
```

## Build the cart badge

```tsx title="CartBadge.tsx"
import { useState } from 'react';
import { shop } from './shop-channel';

function CartBadge() {
  const [items, setItems] = useState(0);
  const send = shop.useSend();

  // Fires when any OTHER tab posts 'cart-updated' — never for our own posts.
  shop.useMessage('cart-updated', (payload) => setItems(payload.items));

  const addToCart = () => {
    setItems(items + 1); // 1. update this tab ourselves…
    send('cart-updated', { items: items + 1 }); // 2. …then notify every other tab
  };

  return <button onClick={addToCart}>Cart ({items})</button>;
}
```

Two lines deserve a closer look.

**The two-step in `addToCart` is the no-echo idiom.** Messages are not delivered
back to the sender — same as raw BroadcastChannel, but documented instead of
surprising. So the sending tab updates itself explicitly, then announces.

Written out like that, the local update and the handler are the same logic in
two places, and two places drift. [`{ echo: true }`](#hearing-your-own-message)
collapses them into one. And if the ceremony feels wrong at all, that is often
the signal the value should be [shared state](../hooks/use-shared-state.md)
instead, where one setter updates every tab including yours.

**The handler closes over `items` safely.** `shop.useMessage` keeps your
handler fresh across renders without resubscribing — no stale-closure bugs,
no effect churn. Details in [`useMessage`](../hooks/use-message.md), which
it delegates to.

:::tip[Still the litmus test]
A tab opened after `cart-updated` fired never hears it. Here that's fine —
the badge is display sugar, and the cart's truth lives on the server. If a
late joiner _must_ know, it's state, not a message.
:::

Prefer not to bind at module level? The standalone
[`useChannel`](../hooks/use-channel.md) / [`useMessage`](../hooks/use-message.md) /
[`useSend`](../hooks/use-send.md) hooks are the same machinery —
`defineChannel` is sugar over them.

## Show who else is here

Presence answers "who else has this open?" with zero setup — every bus
already heartbeats:

```tsx title="PresenceStrip.tsx"
import { usePeers, useClientId } from 'use-everywhere';

function PresenceStrip() {
  const peers = usePeers(); // everyone except me; re-renders on join/leave only
  const me = useClientId();
  return (
    <p>
      me: {me.slice(0, 6)} · also here:{' '}
      {peers.map((p) => `${p.kind} ${p.id.slice(0, 6)}`).join(', ') || 'nobody'}
    </p>
  );
}
```

Open a second tab and it appears in the list within a heartbeat (≤2s,
instantly if it says hello). Close it and it disappears immediately — closing
tabs announce themselves on `pagehide`. Kill it hard (crash, task manager)
and it lingers for ~5 seconds before being pruned. Any traffic — a state
patch, an event — also counts as proof of life, so busy tabs never flicker
offline.

Each peer is `{ id, kind, lastSeen }`, and `kind` distinguishes `'tab'` from
`'worker'` — which is how the demo app renders workers as square dots.

## Combine them: react to _who_ did _what_

Every message handler receives a `meta` argument with the sender's
`clientId` — the same id presence shows for that tab. That's one identity
across features, and it lets you write UI like this:

```tsx
shop.useMessage('logged-out', (_payload, meta) => {
  toast(`Signed out by tab ${meta.clientId.slice(0, 6)}`);
  window.location.assign('/login');
});
```

## Hearing your own message

A post is not echoed to the sender, which matches `BroadcastChannel`. That means
a component doing something locally _and_ telling everyone else ends up writing
the same effect twice — and the two copies drift.

`echo` collapses them into one path:

```tsx
send('item:added', item, { echo: true });

shop.useMessage('item:added', (item, meta) => {
  addToBadge(item); // runs here too, meta.self === true
});
```

## Asking a question

Sometimes you don't want to announce something, you want an answer — "which tab
already has the socket open?", "what did the user pick before I mounted?".

Declare what each type replies with, then `answer` in one place and `ask` from
anywhere:

```tsx
type Requests = { 'draft:get': null };
type Replies = { 'draft:get': string };

const channel = useChannel<Requests, Replies>('editor');

// In whichever component owns the answer:
useAnswer(channel, 'draft:get', () => currentDraft);

// Anywhere else, in any tab:
const draft = await useAsk(channel)('draft:get', null);
```

`ask` **rejects if nobody answers** within the timeout (5s by default) rather
than hanging. If several tabs answer, the first reply wins — gate the responder
on [`useIsLeader`](../hooks/use-leader.md) when it has to be a particular one.

## Where to next

- [`defineChannel`](../hooks/define-channel.md) — the bound hooks used on
  this page.
- [`useChannel`](../hooks/use-channel.md), [`useMessage`](../hooks/use-message.md),
  [`useSend`](../hooks/use-send.md) — the standalone trio underneath.
- [`usePeers`](../hooks/use-peers.md) / [`useClientId`](../hooks/use-client-id.md)
  — everything presence.
- [Log out everywhere](./recipes.md#log-out-everywhere) — this page's
  patterns as a lift-in recipe.
