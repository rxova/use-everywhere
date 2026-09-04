# use-everywhere

React hooks for state and messages that exist in every tab, window, and
worker — plus a secure channel to windows on other origins.

```bash
npm i use-everywhere
```

Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins
  version clocks and a late-joiner handshake, typed pub/sub events, and peer
  presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened — e.g. a payment page on another domain that must report
  back to the checkout that opened it.

## Shared state: `useSharedState`

`useState`, but the value exists in every tab on your origin. Late-joining
tabs hydrate to the current value; concurrent writes converge to one winner.

```tsx
import { useSharedState } from 'use-everywhere';

function Counter() {
  const [count, setCount] = useSharedState('count', 0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

The third argument delimits how far a value travels:

```tsx
useSharedState('draft', '', { scope: 'everywhere' }); // tabs + windows + workers (default)
useSharedState('draft', '', { scope: 'tabs' }); // ignore writes from workers
useSharedState('draft', '', { scope: 'tab' }); // this tab only
```

## Events: `defineChannel`

Typed fire-and-forget messages for things that _happen_ (state is for things
that _are_). Not echoed to the sender; no history for late joiners. Bind the
channel's name and message map once at module level; every component gets
fully typed hooks with nothing to repeat:

```tsx
import { defineChannel } from 'use-everywhere';
import { useState } from 'react';

type ShopEvents = { 'cart-updated': { items: number } };
const shop = defineChannel<ShopEvents>('shop');

function CartBadge() {
  const [items, setItems] = useState(0);
  const send = shop.useSend();

  // Fires when any OTHER tab posts 'cart-updated'.
  shop.useOnMessage('cart-updated', (payload) => setItems(payload.items));

  const addToCart = () => {
    setItems(items + 1); // this tab
    send('cart-updated', { items: items + 1 }); // every other tab
  };

  return <button onClick={addToCart}>Cart ({items})</button>;
}
```

The standalone hooks — `useChannel(name)`, `useOnMessage(channel, type,
handler)`, `useSend(channel)` — are the same machinery without the
module-level binding, for one-off use.

## Presence: `usePeers`

```tsx
import { usePeers } from 'use-everywhere';

function DuplicateTabWarning() {
  const peers = usePeers();
  if (peers.length === 0) return null;
  return <p>⚠ This page is open in {peers.length} other tab(s).</p>;
}
```

## Cross-origin windows: `useWindowResult`

Open a window on another domain, exchange typed messages, and await its
result — the whole lifecycle folded into render state.

```tsx
import { openWindow, useWindowResult } from 'use-everywhere';

type ToPayment = { order: { orderId: string; amount: string } };
type FromPayment = { progress: { step: string } };
type Receipt = { receiptId: string; last4: string };

function PayButton() {
  const pay = useWindowResult<ToPayment, FromPayment, Receipt>(() =>
    openWindow('https://pay.example.com/checkout', {
      peerOrigin: 'https://pay.example.com', // required — '*' throws
    }),
  );

  if (pay.status === 'done') return <p>Paid — receipt {pay.result.receiptId}</p>;
  if (pay.status === 'closed-early') return <p>Payment window was closed.</p>;

  return (
    <button onClick={pay.open} disabled={pay.status !== 'idle'}>
      {pay.status === 'idle' ? 'Pay in secure window' : 'Waiting for payment…'}
    </button>
  );
}
```

On the opened page (the other domain), use the core API:

```tsx
import { connectToOpener } from 'use-everywhere';

const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});
conn.on('order', (order) => setOrder(order)); // e.g. a useState setter
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's pay.result
```

Messages sent before the (possibly slow-loading) child connects are queued,
never dropped, and every received message is validated by origin, envelope,
per-connection nonce, and source window.

## Design notes

- **Shared state never crosses origins.** Two origins are two trust domains;
  the cross-origin channel is explicit, per-message, and typed.
- **No Provider.** A BroadcastChannel is already global to the origin —
  identity is the channel name, so hooks share module-level singletons.
  Imperative access to the same stores: `getSharedStore(name)`.
- SSR-safe: hooks render initial values on the server via
  `getServerSnapshot`; no `BroadcastChannel` needed there.
- Values must survive structured clone (no functions, DOM nodes); state lives
  as long as at least one context holds it — nothing is persisted.
- Testing is first-class: inject a `MemoryHub` transport to simulate many tabs
  in one test. See the [testing guide](https://rxova.org/packages/use-everywhere/guides/testing).

This package re-exports the full framework-agnostic surface of
[`@use-everywhere/core`](https://www.npmjs.com/package/@use-everywhere/core),
so you never need to install core directly.

📖 **[Documentation](https://rxova.org/packages/use-everywhere/)** — mental
model, how sync works, security model, recipes, and generated API reference.
Source and demo app: [github.com/rxova/use-everywhere](https://github.com/rxova/use-everywhere)

## License

MIT
