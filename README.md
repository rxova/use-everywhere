# use-everywhere

<p>
  <a href="https://github.com/rxova/use-everywhere/actions/workflows/ci.yml">
    <img src="https://github.com/rxova/use-everywhere/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" />
  </a>
  <a href="https://github.com/rxova/use-everywhere/actions/workflows/docs.yml">
    <img src="https://github.com/rxova/use-everywhere/actions/workflows/docs.yml/badge.svg?branch=main" alt="Docs" />
  </a>
  <a href="https://www.npmjs.com/package/use-everywhere">
    <img src="https://img.shields.io/npm/v/use-everywhere?color=0f8f6a" alt="npm" />
  </a>
  <img src="https://img.shields.io/badge/coverage-100%25-0f8f6a" alt="coverage 100%" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
</p>

**State, messages, and presence that exist in every tab, window, and worker — with a React API.**

Your app already runs in more than one tab. `useState` doesn't know that. This library gives you the primitives that do, without a server, a Provider, or a state-management rewrite.

**[→ Read the documentation](https://rxova.github.io/use-everywhere/)**

```bash
npm install use-everywhere
```

## What you get

|                          |                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared state**         | `useState`, but the value lives in every tab on the origin. Per-key `[counter, clientId]` clocks give last-writer-wins with a deterministic tie-break; a hello/snapshot handshake hydrates late joiners instantly.        |
| **Typed messages**       | Fire-and-forget pub/sub between tabs. Bind the name and the message map once with `defineChannel`, get typed `useSend`/`useMessage` back.                                                                                 |
| **Presence**             | Who else is here, right now — tabs, windows, workers — with a heartbeat and automatic pruning.                                                                                                                            |
| **Leader election**      | Exactly one tab owns the WebSocket, the polling loop, the token refresh. Lease-and-claim with a sticky incumbent: opening a tab doesn't steal the seat, closing one hands it over instantly. Opt-in, and opt-out per tab. |
| **Cross-origin windows** | A secure 1:1 channel to a window you opened on **another domain** — a payment page that must report back to the checkout. Validated by origin, envelope brand, per-connection nonce, and source window.                   |
| **Devtools**             | `observeBus` / `enableDebug` surface every wire crossing the bus, in both directions.                                                                                                                                     |

Two transports behind one library: **BroadcastChannel** for same-origin, **postMessage** for the cross-origin window channel. Shared state deliberately never crosses origins — two origins are two trust domains, so that channel is explicit, per-message, and typed.

## The main usages

**State, messages, and presence.** No Provider: a BroadcastChannel is already global to the origin, so identity is the channel name and the hooks share module-level singletons.

```tsx
import { useState } from 'react';
import { useSharedState, defineChannel, usePeers } from 'use-everywhere';

type ShopEvents = { 'cart-updated': { items: number } };
const shop = defineChannel<ShopEvents>('shop'); // bind name + types once, at module level

function StatusBar() {
  const [count, setCount] = useSharedState('count', 0); // exists in every tab

  const [cartItems, setCartItems] = useState(0);
  shop.useMessage('cart-updated', (payload) => setCartItems(payload.items)); // fires when another tab posts

  const peers = usePeers(); // who else is here

  return (
    <p>
      count {count} · cart {cartItems} · {peers.length} other tabs
      <button onClick={() => setCount((c) => c + 1)}>+1 everywhere</button>
    </p>
  );
}
```

**One tab does the work.** The classic multi-tab bug is N tabs opening N sockets. `useLeaderEffect` runs an effect only in the elected tab, and moves it when that tab goes away.

```tsx
import { useLeaderEffect, useIsLeader } from 'use-everywhere';

function LiveFeed() {
  useLeaderEffect(() => {
    const socket = new WebSocket('wss://example.com/feed'); // exactly one, across all tabs
    return () => socket.close(); // runs if this tab loses the seat
  });

  return <span>{useIsLeader() ? 'driving' : 'following'}</span>;
}
```

Leadership is **advisory, not a distributed lock** — good for "don't open five sockets", not for guarding money. See [Limitations](https://rxova.github.io/use-everywhere/under-the-hood/limitations).

**A window on another origin.** Open it, hand it typed data, await its result.

```tsx
import { openWindow, useOpenedWindow } from 'use-everywhere';

type ToPayment = { order: { orderId: string; amount: string } };
type FromPayment = { progress: { step: string } };
type Receipt = { receiptId: string; last4: string };

const pay = useOpenedWindow<ToPayment, FromPayment, Receipt>(() =>
  openWindow('https://pay.example.com/checkout', { peerOrigin: 'https://pay.example.com' }),
);
// pay.open() from a click handler; pay.status: idle → opening → connected → done
// pay.result is the child's finish() value; closing early yields 'closed-early'.
```

On the opened page:

```ts
import { connectToOpener } from 'use-everywhere';

const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});
conn.on('order', (order) => showOrderSummary(order));
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's pay.result
```

## Packages

| Package                                 | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| [`use-everywhere`](packages/react)      | React hooks; re-exports the full core surface             |
| [`@use-everywhere/core`](packages/core) | Framework-agnostic engine — no React dependency           |
| `@use-everywhere/demo` (`apps/demo`)    | Vite demo app, including a real cross-origin payment flow |

Everything is tree-shakeable and measured: the whole core surface is under 4 kB brotlied, and importing one primitive costs roughly one primitive.

## Running it locally

```bash
pnpm install
pnpm dev        # demo at http://localhost:5173
pnpm test       # 100% coverage, enforced per file
```

The demo's **"Pay in secure window"** button opens `http://127.0.0.1:5173/payment.html` — the same Vite server, but `localhost` and `127.0.0.1` are **different origins**, so the payment page genuinely cannot reach the shop over BroadcastChannel. Complete the fake card form and the opener resolves with a receipt; close the window mid-payment and the checkout unlocks with a "window closed" notice. Open the shop in a second tab first to also see the cross-tab lock: paying in one tab locks the button in all of them.

## Caveats worth knowing up front

- Values must survive [structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) — no functions, DOM nodes, or class instances.
- Client-side locks are **UX, not security**. The payment lock prevents _accidental_ double payment; server-side idempotency keys are still required for real safety.
- A backgrounded tab has its timers throttled, so a healthy leader can still lose its lease.

## Contributing & releases

`main` always represents the latest version published to npm — branch off it, PR back into it. Once CI passes on a merge, the release automation applies pending [changesets](https://github.com/changesets/changesets), publishes to npm with provenance, and tags the release. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
