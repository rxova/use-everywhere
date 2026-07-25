---
title: 'useSend'
sidebar:
  order: 5
---

`useSend` gives you a channel's `post` function with stable identity — the
"announce" half of the event system. It exists so you can hand a typed,
never-changing send function to child components, callbacks, and effects
without memoizing anything.

```tsx
import { useChannel, useSend } from 'use-everywhere';

type ShopEvents = { 'cart-updated': { items: number } };

function AddToCart({ items }: { items: number }) {
  const channel = useChannel<ShopEvents>('shop');
  const send = useSend(channel);

  return <button onClick={() => send('cart-updated', { items: items + 1 })}>Add to cart</button>;
}
```

## Signature

```ts
function useSend<M extends MessageMap>(channel: Channel<M>): Channel<M>['post'];
// i.e. <K extends keyof M & string>(type: K, payload: M[K]) => void
```

No options. The returned function is the channel's own `post`, typed against
the channel's message map: event names autocomplete, payload shapes are
checked.

## Return value

A `(type, payload) => void` function that broadcasts to every _other_ tab,
window, and worker on the origin, fire-and-forget. Because the channel is a
page-wide singleton, the function's identity is stable across renders — safe
in dependency arrays, safe to pass down, no `useCallback` required.

## Worked example: update yourself, then tell everyone

The one pattern to internalize — posts don't echo, so the sending tab updates
itself explicitly first:

```tsx title="CartBadge.tsx"
function CartBadge() {
  const [items, setItems] = useState(0);
  const channel = useChannel<ShopEvents>('shop');
  const send = useSend(channel);

  useMessage(channel, 'cart-updated', (p) => setItems(p.items)); // other tabs

  const addToCart = () => {
    setItems(items + 1); // 1. this tab, explicitly
    send('cart-updated', { items: items + 1 }); // 2. every other tab
  };

  return <button onClick={addToCart}>Cart ({items})</button>;
}
```

If both sides of that pattern feel like ceremony for your use case, that's
usually a sign the value should be [shared state](./use-shared-state.md)
instead — one `setCount` and every tab (including yours) updates.

## Gotchas

- **Fire-and-forget.** No ack, no retry, no queue. A tab that isn't listening
  right now misses the event, permanently.
- **Never echoed to the sender.** By design, same as raw BroadcastChannel —
  see the worked example above for the idiom.
- **It's just sugar.** `useSend(channel)` returns `channel.post`; calling
  `channel.post(...)` directly is equally fine. Use whichever reads better.

## Where to next

- [`useMessage`](./use-message.md) — the listening half, and the meta
  argument.
- [`useChannel`](./use-channel.md) — where the typing comes from.
- [`defineChannel`](./define-channel.md) — bind name and types once and skip
  the trio's ceremony.
- [Messages & presence guide](../guides/messages-and-presence.md) — the trio
  in context.
