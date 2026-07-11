---
sidebar_position: 2
---

# Messages & presence

## Typed events between tabs

Shared state is for values; channels are for _things that happen_. Declare a
message map once and every `post`/`on` is fully typed:

```tsx
import { useChannel, useMessage, useSend } from 'use-everywhere';

type ShopEvents = {
  'cart-updated': { items: number };
  'logged-out': undefined;
};

function CartBadge() {
  const channel = useChannel<ShopEvents>('shop');
  const send = useSend(channel);

  useMessage(channel, 'cart-updated', ({ items }) => refresh(items));

  return <button onClick={() => send('cart-updated', { items: 3 })}>sync</button>;
}
```

Messages are fire-and-forget and are **not** echoed back to the sender. The
handler you pass to `useMessage` is kept fresh across renders without
resubscribing, so it can safely close over component state.

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
