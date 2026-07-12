---
sidebar_position: 2
---

# Messages & presence

## Typed events between tabs

Shared state is for values; channels are for _things that happen_. Declare a
message map once and every `post`/`on` is fully typed:

```tsx
import { useState } from 'react';
import { useChannel, useMessage, useSend } from 'use-everywhere';

type ShopEvents = {
  'cart-updated': { items: number };
  'logged-out': undefined;
};

function CartBadge() {
  const [items, setItems] = useState(0);
  const channel = useChannel<ShopEvents>('shop');
  const send = useSend(channel);

  // Fires when any OTHER tab posts 'cart-updated' — never for our own posts.
  useMessage(channel, 'cart-updated', (payload) => setItems(payload.items));

  const addToCart = () => {
    setItems(items + 1); // update this tab ourselves…
    send('cart-updated', { items: items + 1 }); // …and notify every other tab
  };

  return <button onClick={addToCart}>Cart ({items})</button>;
}
```

Messages are fire-and-forget and are **not** echoed back to the sender —
that is why `addToCart` updates its own tab explicitly before posting. The
handler you pass to `useMessage` is kept fresh across renders without
resubscribing, so it can safely close over component state (like `items`
above).

## Who else is here?

```tsx
import { usePeers, useClientId } from 'use-everywhere';

function PresenceDots() {
  const peers = usePeers();
  const me = useClientId();
  return (
    <>
      me: {me} · others: {peers.map((p) => `${p.kind} ${p.id}`).join(', ')}
    </>
  );
}
```

Every client heartbeats over its bus; peers silent for ~5 seconds are pruned,
and closing tabs announce themselves on `pagehide`. Any traffic (state patches,
events) also counts as a liveness signal, so busy tabs never flicker offline.
