# use-everywhere

<p>
  <a href="https://github.com/rxova/use-everywhere/actions/workflows/ci.yml">
    <img src="https://github.com/rxova/use-everywhere/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" />
  </a>
  <a href="https://github.com/rxova/use-everywhere/actions/workflows/docs.yml">
    <img src="https://github.com/rxova/use-everywhere/actions/workflows/docs.yml/badge.svg?branch=main" alt="Docs" />
  </a>
  <img src="https://img.shields.io/badge/coverage-%E2%89%A5%2090%25%20per%20file-0f8f6a" alt="coverage >= 90% per file" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
</p>

State and messages that exist in every tab, window, and worker — with a React API.
[→ Documentation](https://rxova.github.io/use-everywhere/)

Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins version
  clocks and a late-joiner handshake, typed pub/sub events, and peer presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened — e.g. a payment page on another domain that must report
  back to the checkout that opened it. Every message is validated by origin,
  envelope brand, a per-connection nonce, and the source window.

## Packages

| Package                                  | Purpose                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| `use-everywhere` (`packages/react`)      | React hooks; re-exports the full core surface             |
| `@use-everywhere/core` (`packages/core`) | Framework-agnostic engine                                 |
| `@use-everywhere/demo` (`apps/demo`)     | Vite demo app, including a real cross-origin payment flow |

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm dev        # demo at http://localhost:5173
```

## React API

```tsx
import { useState } from 'react';
import { useSharedState, useChannel, useMessage, usePeers } from 'use-everywhere';

type ShopEvents = { 'cart-updated': { items: number } };

function StatusBar() {
  // useState, but the value exists in every tab/window/worker on this origin.
  const [count, setCount] = useSharedState('count', 0);

  // Typed fire-and-forget events: fires when any OTHER tab posts 'cart-updated'.
  const [cartItems, setCartItems] = useState(0);
  const channel = useChannel<ShopEvents>('shop');
  useMessage(channel, 'cart-updated', (payload) => setCartItems(payload.items));

  // Who else is here? (other tabs = circles, workers = squares in the demo)
  const peers = usePeers();

  return (
    <p>
      count {count} · cart {cartItems} · {peers.length} other tabs
      <button onClick={() => setCount((c) => c + 1)}>+1 everywhere</button>
    </p>
  );
}
```

The payment-window flow — open a window on **another origin**, await its result:

```tsx
import { openWindow, useOpenedWindow } from 'use-everywhere';

type ToPayment = { order: { orderId: string; amount: string } };
type FromPayment = { progress: { step: string } };
type Receipt = { receiptId: string; last4: string };

const pay = useOpenedWindow<ToPayment, FromPayment, Receipt>(() =>
  openWindow('https://pay.example.com/checkout', {
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
conn.on('order', (order) => showOrderSummary(order)); // hand it to your UI
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's pay.result
```

Design notes:

- **Shared state never crosses origins.** Two origins are two trust domains;
  the cross-origin channel is explicit, per-message, and typed. Same-origin
  state sync uses per-key `[counter, clientId]` clocks (last-writer-wins,
  deterministic tie-break) and a hello/snapshot handshake so late-joining tabs
  hydrate instantly.
- **No Provider.** A BroadcastChannel is already global to the origin —
  identity is the channel name, so hooks share module-level singletons.
- Values must survive structured clone (no functions, DOM nodes, etc.).
- The UI-level payment lock prevents _accidental_ double payment; server-side
  idempotency keys are still required for real safety.

## Trying the cross-origin payment demo

`pnpm dev`, then open <http://localhost:5173>. The checkout's "Pay in secure
window" button opens `http://127.0.0.1:5173/payment.html` — same Vite server,
but `localhost` and `127.0.0.1` are **different origins**, so the payment page
genuinely cannot use BroadcastChannel to reach the shop. Complete the fake card
form and the opener resolves with a receipt; close the window mid-payment and
the checkout unlocks with a "window closed" notice. Open the shop in a second
tab first to also see the cross-tab lock: paying in one tab locks the button in
all of them.

The original single-file prototypes live in `prototypes/` (open directly in a
browser, no build needed).

## Branching & releases

`main` always represents the latest version published to npm; day-to-day work
happens on `development`. Merging `development` into `main` triggers the
release automation, which applies pending [changesets](https://github.com/changesets/changesets)
(patch/minor/major per package), publishes to npm with provenance, and tags the
release. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full flow.
