---
sidebar_position: 3
---

# Cross-origin payments

The scenario: a checkout on **domain A** opens a payment window on
**domain B**. When the user finishes there, the payment page must report back
to the checkout that opened it.

BroadcastChannel cannot do this — it is strictly same-origin. use-everywhere
covers it with a dedicated 1:1 window channel over `postMessage`.

## The opener side

```tsx
import { openWindow, useOpenedWindow } from 'use-everywhere';

type ToPayment = { order: { orderId: string; amount: string } };
type FromPayment = { progress: { step: string } };
type Receipt = { receiptId: string; last4: string };

function Checkout() {
  const pay = useOpenedWindow<ToPayment, FromPayment, Receipt>(() =>
    openWindow('https://pay.example.com/checkout', {
      peerOrigin: 'https://pay.example.com',
      features: 'popup,width=440,height=640',
    }),
  );

  useEffect(() => {
    if (pay.status === 'connected') pay.post('order', ORDER);
  }, [pay.status]);

  // pay.status: idle → opening → connected → done
  //             (or 'closed-early' if the user closes the window mid-payment)
  return <button onClick={pay.open}>Pay in secure window</button>;
}
```

## The payment page (child)

```ts
import { connectToOpener } from '@use-everywhere/core';

const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});

conn.on('order', (order) => render(order));

// when the card is charged:
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's `result`
conn.close();
```

## What the library handles for you

- **A slow-loading child.** The child announces `ready` every 250ms until the
  opener acks; everything either side posts before the handshake is queued,
  never dropped.
- **Security.** `peerOrigin` is required on both ends (`'*'` throws). Every
  received message is validated by origin, an envelope brand, a per-connection
  nonce carried in the child URL, and — on the opener — the source window.
- **The user closing the window.** The opener polls the window and listens for
  the child's `pagehide` signal; `result` rejects with `WindowClosedError` so
  your UI can unlock.
- **Popup blockers.** If `window.open` returns null, `ready` and `result`
  reject immediately with a clear error. Call `open()` from a click handler.

## Why not sync shared state across origins?

Two origins are two trust domains. Letting a foreign page merge writes into
your state tree is a confused-deputy hazard, so cross-origin communication is
explicit, per-message, and typed — and the payment flow is request/result
shaped anyway.

:::note
The UI-level lock prevents _accidental_ double payment. Real payment safety
still requires server-side idempotency keys.
:::
