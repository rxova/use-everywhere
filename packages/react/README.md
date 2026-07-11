# use-everywhere

React hooks for state and messages that exist in every tab, window, and worker.

```bash
npm i use-everywhere
```

Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins version
  clocks and a late-joiner handshake, typed pub/sub events, and peer presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened — e.g. a payment page on another domain that must report
  back to the checkout that opened it. Every message is validated by origin,
  envelope brand, a per-connection nonce, and the source window.

## Usage

```tsx
import {
  useSharedState,
  useChannel,
  useMessage,
  usePeers,
  useOpenedWindow,
  openWindow,
} from 'use-everywhere';

// useState, but the value exists in every tab/window/worker on this origin.
const [count, setCount] = useSharedState('count', 0);

// Typed fire-and-forget events between tabs.
const channel = useChannel<{ 'cart-updated': { items: number } }>('shop');
useMessage(channel, 'cart-updated', ({ items }) => refresh(items));
channel.post('cart-updated', { items: 3 });

// Who else is here?
const peers = usePeers();

// Open a window on ANOTHER origin and await its result.
const pay = useOpenedWindow(() =>
  openWindow<ToPayment, FromPayment, Receipt>('https://pay.example.com/checkout', {
    peerOrigin: 'https://pay.example.com',
  }),
);
// pay.open() from a click handler; pay.status: idle → opening → connected → done
// pay.result is the child's finish() value; closing early yields 'closed-early'.
```

On the opened (child) page:

```ts
import { connectToOpener } from 'use-everywhere';

const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});
conn.on('order', (order) => render(order));
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's result
```

## Design notes

- **Shared state never crosses origins.** Two origins are two trust domains;
  the cross-origin channel is explicit, per-message, and typed.
- **No Provider.** A BroadcastChannel is already global to the origin —
  identity is the channel name, so hooks share module-level singletons.
- Values must survive structured clone (no functions, DOM nodes, etc.).

This package re-exports the full framework-agnostic surface of
[`@use-everywhere/core`](https://www.npmjs.com/package/@use-everywhere/core),
so you never need to install core directly.

Full docs, demo app (including a real cross-origin payment flow), and source:
[github.com/rxova/use-everywhere](https://github.com/rxova/use-everywhere)

## License

MIT
