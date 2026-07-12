---
sidebar_position: 9
---

# useOpenedWindow

`useOpenedWindow` turns the messiest flow in web development — open a window
on _another domain_, talk to it, and get a result back — into plain render
state. Think checkout on `shop.example.com` opening a payment page on
`pay.example.com`: the hook gives you a `status` to render, a typed `post`,
and a `result` when the child finishes. The handshake, the message
validation, the "user closed the window" detection: all handled.

```tsx
import { openWindow, useOpenedWindow } from 'use-everywhere';

type ToPayment = { order: { orderId: string; amount: string } };
type FromPayment = { progress: { step: string } };
type Receipt = { receiptId: string; last4: string };

function PayButton() {
  const pay = useOpenedWindow<ToPayment, FromPayment, Receipt>(() =>
    openWindow('https://pay.example.com/checkout', {
      peerOrigin: 'https://pay.example.com',
      features: 'popup,width=440,height=640',
    }),
  );

  if (pay.status === 'done') return <p>✓ receipt {pay.result!.receiptId}</p>;
  if (pay.status === 'closed-early') return <p>Window closed — try again.</p>;
  if (pay.status === 'error') return <p>Something broke: {String(pay.error)}</p>;

  return (
    <button onClick={pay.open} disabled={pay.status !== 'idle'}>
      {pay.status === 'idle' ? 'Pay in secure window' : 'Waiting…'}
    </button>
  );
}
```

## Signature

```ts
function useOpenedWindow<Out extends MessageMap, In extends MessageMap, R = unknown>(
  factory: () => OpenedWindow<Out, In, R>,
): UseOpenedWindow<Out, In, R>;
```

The three type parameters are the contract with the child window: `Out` —
messages you send it, `In` — messages it sends you, `R` — the one result it
finishes with.

You pass a **factory**, not a window: nothing opens at render time. The
factory runs when you call `open()` — from a click handler, because popup
blockers require a user gesture.

## `openWindow` options (what the factory calls)

| Option           | Type      | Default      | What it does                                                                                          |
| ---------------- | --------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `peerOrigin`     | `string`  | **required** | The exact origin allowed to talk to you. `'*'` throws. The URL must belong to it too.                 |
| `features`       | `string`  | —            | Passed to `window.open` — `'popup,width=440,height=640'` and friends.                                 |
| `readyTimeoutMs` | `number`  | `15000`      | How long to wait for the child to complete the handshake before failing with `HandshakeTimeoutError`. |
| `allowAnyOrigin` | `boolean` | `false`      | Dev-only escape hatch, named to be scary. Never ship it.                                              |

(`openFn` and `localWindow` also exist as injection seams for tests — see
[Testing](../guides/testing.md#testing-window-flows-without-windows).)

## Return value

| Field    | Type                                                                        | Notes                                                                                            |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `open`   | `() => void`                                                                | Call from a user gesture. Calling it again closes and replaces the previous window.              |
| `status` | `'idle' \| 'opening' \| 'connected' \| 'done' \| 'closed-early' \| 'error'` | The whole lifecycle as render state — see below.                                                 |
| `result` | `R \| undefined`                                                            | The child's `finish()` value, once `status === 'done'`.                                          |
| `error`  | `unknown`                                                                   | Set for `'closed-early'` and `'error'`.                                                          |
| `post`   | `(type, payload) => void`                                                   | Typed post to the child. Safe no-op while nothing is open; queued until the handshake completes. |
| `close`  | `() => void`                                                                | Close the child window yourself.                                                                 |

### The status lifecycle

```
idle ──open()──► opening ──handshake──► connected ──finish()──► done
                    │                       │
                    └──── window closed ────┴──► closed-early
                    └──── anything else ────────► error
```

- **`opening`** — the window exists, the child page is still loading.
  Anything you `post` now is queued locally, not dropped.
- **`connected`** — the handshake completed; queued messages flushed; the
  child's messages start arriving.
- **`done`** — the child called `finish(value)`; `result` holds the value.
- **`closed-early`** — the user closed the window before finishing
  (`WindowClosedError`). Detected within ~400ms even if the child crashed.
- **`error`** — anything else: handshake timeout, popup blocked, the child
  rejecting. `error` has the reason.

A stale window's outcome is ignored: if you `open()` a second time, whatever
the first window does later cannot touch your state.

## The other side of the conversation

The child page uses `connectToOpener` — core API, framework-free, same
`peerOrigin` discipline:

```ts title="on pay.example.com"
import { connectToOpener } from '@use-everywhere/core';

const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});
conn.on('order', (order) => renderOrderSummary(order));
conn.post('progress', { step: 'card-entered' });
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's result
```

The full two-sided walkthrough lives in
[Cross-origin payments](../guides/cross-origin-payments.md).

## Gotchas

- **Call `open()` from a click handler.** Popup blockers require a user
  gesture; if `window.open` returns `null` you land in `'error'` with a clear
  message.
- **`peerOrigin` is not optional and `'*'` throws.** This is the security
  model refusing to let you hold the foot-gun — every incoming message is
  checked against four gates ([which ones?](../under-the-hood/security-model.md#cross-origin-the-other-page-is-nobody)).
- **This is messaging, not shared state.** State never crosses origins, on
  purpose: automatic merges from another security principal would be a
  confused-deputy bug. Explicit typed messages only.
- **Send data after `'connected'`, or just send.** `post` queues while
  `'opening'`, so you can fire your order details immediately after `open()`
  and they'll arrive once the handshake lands.
- **A client-side lock is UX, not security.** Pair the flow with server-side
  idempotency keys for anything involving money.

## Where to next

- [Cross-origin payments guide](../guides/cross-origin-payments.md) — both
  sides, end to end, including the loading-race diagram.
- [Security model](../under-the-hood/security-model.md) — the four gates on
  every message.
- [Testing](../guides/testing.md#testing-window-flows-without-windows) —
  drive the whole lifecycle with fake windows, no browser needed.
