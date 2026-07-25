---
title: 'useMessage'
sidebar:
  order: 4
---

`useMessage` runs a handler whenever another tab posts a given event. It's
the "listen" half of the typed event system — you give it a channel from
[`useChannel`](./use-channel.md), an event name, and a handler, and it
manages the subscription for the component's lifetime.

```tsx
import { useChannel, useMessage } from 'use-everywhere';

type AuthEvents = { 'logged-out': undefined };

function SessionGuard() {
  const channel = useChannel<AuthEvents>('auth');

  useMessage(channel, 'logged-out', () => {
    window.location.assign('/login'); // another tab logged us out
  });

  return null;
}
```

## Signature

```ts
function useMessage<M extends MessageMap, K extends keyof M & string>(
  channel: Channel<M>,
  type: K,
  handler: (payload: M[K], meta: MessageMeta) => void,
): void;
```

No options, no return value. The payload type is inferred from the channel's
message map, so the handler is fully typed.

## The `meta` argument

Every handler receives a second argument telling you who sent the event:

```ts
interface MessageMeta {
  clientId: string; // the sender's bus id — matches useClientId() in that tab
  kind: PeerKind; // 'tab' | 'worker'
  self: boolean; // always false in channel handlers — posts never echo
}
```

(The `self` flag exists because the same `MessageMeta` shape is used by store
subscriptions, where your _own_ writes do notify with `self: true`.)

`meta.clientId` is the same id you'd see in [`usePeers`](./use-peers.md) for
that tab, so "who sent this" and "which presence dot is that" have one
answer.

## No stale closures, no resubscribe churn

This hook has one genuinely nice trick: the handler is kept fresh through a
ref, **without resubscribing**. The subscription itself only changes when
`channel` or `type` change — but the handler that runs is always the one from
your latest render, so it can close over current props and state safely:

```tsx
function CartBadge() {
  const [items, setItems] = useState(0);
  const channel = useChannel<ShopEvents>('shop');

  // `items` here is never stale, and this never tears down / re-subscribes
  // on every render the way a raw useEffect subscription would.
  useMessage(channel, 'cart-updated', (payload) => {
    console.log(`cart went from ${items} to ${payload.items}`);
    setItems(payload.items);
  });

  return <span>Cart ({items})</span>;
}
```

If you've ever debugged a `useEffect` subscription that captured an old
value, that's the bug this design deletes.

## Gotchas

- **You never hear your own posts.** BroadcastChannel doesn't echo, and the
  library keeps that behavior (documented instead of surprising). When your
  tab does the thing, update your own UI explicitly, then post.
- **No history.** The handler only fires for events posted while this
  component is mounted. Anything a late joiner must know belongs in
  [state](./use-shared-state.md), which re-hydrates.
- **At-most-once delivery.** There's no ack or retry: a tab that's
  mid-refresh when the event fires simply misses it. Same rule — if missing
  it would be a bug, it's state, not an event.

## Where to next

- [`useSend`](./use-send.md) — the "announce" half.
- [Messages & presence guide](../guides/messages-and-presence.md) — a full
  worked feature.
- [Log out everywhere](../guides/recipes.md#log-out-everywhere) — the
  classic use of this hook, as a recipe.
