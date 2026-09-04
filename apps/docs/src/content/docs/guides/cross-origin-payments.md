---
title: 'Cross-origin payments'
description: 'Build a checkout that opens a payment window on another domain, hands it typed data and awaits a receipt — validated by origin, brand and nonce.'
sidebar:
  order: 3
---

This is the flow the window channel exists for, so let's do it properly.
The scenario: a checkout on **`shop.example.com`** opens a payment window on
**`pay.example.com`**. The user pays there; the payment page must report back
to the checkout that opened it.

BroadcastChannel can't help — it's strictly same-origin, and
`pay.example.com` is a different universe. The _only_ bridge between windows
on different origins is `postMessage`, and hand-rolling it safely means
handshakes, origin checks, nonces, and window-close polling. use-everywhere
ships all of that as a dedicated 1:1 window channel. We'll build both sides.

## Define the contract

Three types, shared between the two codebases (a tiny shared package, or just
copied — it's the contract that matters):

```ts title="payment-contract.ts"
export type ToPayment = { order: { orderId: string; amount: string } };
export type FromPayment = { progress: { step: string } };
export type Receipt = { receiptId: string; last4: string };
```

Read them as: what the shop sends, what the payment page sends, and the one
result the whole flow produces.

## The opener side (the shop)

```tsx title="Checkout.tsx (on shop.example.com)"
import { useEffect } from 'react';
import { openWindow, useWindowResult } from 'use-everywhere';
import type { ToPayment, FromPayment, Receipt } from './payment-contract';

function Checkout({ order }: { order: ToPayment['order'] }) {
  const pay = useWindowResult<ToPayment, FromPayment, Receipt>(() =>
    openWindow('https://pay.example.com/checkout', {
      peerOrigin: 'https://pay.example.com', // required — '*' throws
      features: 'popup,width=440,height=640',
    }),
  );

  // Send the order as soon as the handshake lands. (Posting earlier is fine
  // too — posts queue while the child loads.)
  useEffect(() => {
    if (pay.status === 'connected') pay.post('order', order);
  }, [pay.status]);

  if (pay.status === 'done') return <ReceiptView receipt={pay.result} />;
  if (pay.status === 'closed-early') return <p>Window closed — try again.</p>;

  return (
    <button onClick={pay.open} disabled={pay.status !== 'idle'}>
      Pay in secure window
    </button>
  );
}
```

`pay.open` must be called from the click handler — popup blockers require a
user gesture. From there, `status` walks `idle → opening → connected → done`,
and your UI is just a render of it. The full status table is in
[`useWindowResult`](../hooks/use-window-result.md#return-value).

## The child side (the payment page)

The payment page uses `connectToOpener` from core — framework-free, so it
works whatever renders that page. Note it names _the shop's_ origin: each
side declares exactly who it will talk to.

```tsx title="PaymentPage.tsx (on pay.example.com)"
import { useEffect, useState } from 'react';
import { connectToOpener } from '@use-everywhere/core';
import type { ToPayment, FromPayment, Receipt } from './payment-contract';

// Create the connection once, at module level. (It throws when the page is
// opened directly, without an opener — catch that for users who bookmark
// the URL and show a "return to the shop" screen.)
const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});

function PaymentPage() {
  const [order, setOrder] = useState<ToPayment['order'] | null>(null);
  useEffect(() => conn.on('order', setOrder), []); // on() returns its unsubscribe

  const chargeCard = async () => {
    conn.post('progress', { step: 'charging' });
    const receipt = await submitToPaymentProcessor(); // your payment logic
    conn.finish(receipt); // resolves the opener's result → status 'done'
    conn.close();
  };

  if (!order) return <p>Loading order…</p>;
  return <CardForm amount={order.amount} onSubmit={chargeCard} />;
}
```

`finish(value)` is the whole point of the flow: one result, delivered to the
opener's `result`, flipping its status to `'done'`.

## What just got handled for you

Every item in this list is a classic hand-rolled `postMessage` bug:

- **The slow-loading child.** `window.open` returns immediately; the child
  takes seconds to load; naive `postMessage` calls in that window are
  silently dropped. Here, the child announces `ready` every 250ms until the
  opener acks, and everything either side posts before that is queued —
  never lost. You stop caring how slow the payment page loads.
- **The trust problem.** Every incoming message must pass four gates —
  exact origin, the library's envelope brand, a per-connection nonce carried
  in the child's URL, and (on the opener) the exact source window — before
  your handler runs. Fail any gate and the message is dropped silently.
  Details in the [security model](../under-the-hood/security-model.md).
- **The user closing the window.** The opener polls `child.closed` (~400ms)
  _and_ listens for the child's `pagehide` goodbye, so `status` lands in
  `'closed-early'` promptly whether the window closed cleanly or crashed —
  and your UI can unlock.
- **Popup blockers.** If `window.open` returns `null`, you land in
  `'error'` with a clear message instead of a mystery.

## Why not just share state across origins?

Because two origins are two trust domains, and state merging is _automatic_
— whatever arrives with a newer clock wins, no questions asked. Automatic
writes from a foreign security principal into your application state is a
confused-deputy bug waiting to happen. Messages only do what your explicit,
typed handler does. **Across trust boundaries, explicit beats magic** — and
the payment flow is request/result shaped anyway.

:::note[UX lock ≠ security]
Pairing this flow with the [single-flight lock](./recipes.md#the-duplicate-tab-lock-single-flight)
prevents _accidental_ double payment across tabs. Real payment safety still
requires server-side idempotency keys.
:::

## Try it without two domains

The demo app fakes two origins on one Vite server: you browse
`http://localhost:5173` and the payment window opens `http://127.0.0.1:5173`.
Same server — but the browser treats them as genuinely different origins, so
the real handshake, nonce, and origin gates all run. `pnpm dev` in the repo
and click "Pay in secure window".

## Where to next

- [`useWindowResult`](../hooks/use-window-result.md) — every option, the
  full status machine, and the gotchas.
- [Security model](../under-the-hood/security-model.md) — the four gates,
  one by one.
- [Testing](./testing.md#testing-window-flows-without-windows) — drive this
  whole flow with fake windows in a unit test.
