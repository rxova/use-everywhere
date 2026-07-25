---
title: "Security model"
sidebar:
  order: 2
---

use-everywhere has two very different security postures, matching its
[two worlds](../learn/mental-model.md#idea-2-two-worlds-two-trust-levels).
Knowing which one you're in tells you what the library checks for you and
what remains your job — so let's take them in turn, same-origin first
because it's the short one.

## Same origin: everyone is you

Everything on one origin — every tab, iframe from your domain, worker — runs
your code with your cookies. BroadcastChannel is already scoped to the
origin by the browser, so the same-origin engines add **no authentication at
all**, on purpose:

- Any code on your origin can join any bus, read state, and write patches.
- A compromised dependency on your page can too — but it could equally read
  `localStorage` or your DOM. The bus does not widen that blast radius.

The one same-origin knob is _filtering_, not security: `scope: 'tabs'` (or a
custom `accept` predicate on `createSharedStore`) lets a store ignore writes
from workers. That's a coordination tool — a worker is still your code.

:::caution Don't put secrets in shared state
State is broadcast to every context on the origin and lives in plain JS
memory. Treat it like you treat React state — fine for UI status, wrong for
raw card numbers or tokens that deserve tighter handling.
:::

## Cross origin: the other page is nobody

The window channel assumes the opposite: the page on the other side is a
different security principal, and `postMessage` is a public mailbox — any
window that holds a reference to yours can post to it, and by default a
listener cannot tell who sent what. This is the API where real money gets
lost, so the paranoia is built in rather than left as an exercise.

Every message a channel receives must pass **four gates** before your
handler ever runs:

| Gate        | Check                                                                                             | Stops                                                          |
| ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Origin   | `event.origin === peerOrigin` (exact match, no wildcards)                                         | Any site you did not name                                      |
| 2. Envelope | payload carries the library brand (`__ue: 1`)                                                     | Unrelated `postMessage` traffic on the same page               |
| 3. Nonce    | `cid` equals the id minted for _this_ `openWindow()` call, delivered via the `?ue-cid=` URL param | Stale windows, replays from earlier sessions, guessed messages |
| 4. Source   | `event.source` is the exact `Window` we opened (opener side)                                      | A third frame on the _correct_ origin impersonating the child  |

Fail any gate, and the message is dropped silently — your handlers never
run. Note what gate 4 buys you: even a hostile iframe on the _correct_
origin fails, because it isn't the exact window object you opened.

Outbound is symmetric: every `postMessage` is sent with an explicit
`targetOrigin`, so the browser itself refuses delivery if the window has
meanwhile navigated somewhere unexpected.

### `peerOrigin` is required, `'*'` throws

```ts
openWindow(url, { peerOrigin: 'https://pay.example.com' }); // ✅
openWindow(url, { peerOrigin: '*' }); // ❌ throws
```

The API is shaped so the insecure thing is not expressible. A wildcard would
disable gate 1 and the outbound `targetOrigin` check at once — that's the
textbook postMessage vulnerability, and it doesn't compile here. For local
prototyping there is an explicit escape hatch — `allowAnyOrigin: true` —
named so it cannot be mistaken for production configuration. `openWindow`
also cross-checks that the URL you open actually belongs to `peerOrigin`,
catching copy-paste mismatches at call time.

## Why shared state stops at the origin line

It's tempting to want `useSharedState` to just work across the payment
window too. The library refuses by design, and the refusal is worth
spelling out:

1. **Confused deputy.** State merging is automatic — whatever arrives with a
   newer clock wins, no questions asked. Automatic writes from a foreign
   principal into your application state is precisely how a compromised or
   buggy partner page would corrupt yours. Messages, by contrast, only do
   what your explicit, typed handler does. Across trust boundaries,
   **explicit beats magic**.
2. **Auditability.** A typed message map (`{ 'payment-complete': Receipt }`)
   is a reviewable contract between two domains. "Any key, any value, newest
   clock wins" is not.
3. **The shapes differ anyway.** Cross-origin flows are request/result
   shaped — open a window, exchange a handful of messages, get one result. A
   convergent replicated object buys nothing there.

## What the library does _not_ protect against

Honesty about the boundary, because trusting a tool means knowing its edges:

- **Your own origin.** XSS on your page owns every bus. The library neither
  helps nor hurts.
- **The peer's content.** Gate 1 verifies _where_ a message came from, not
  that the payment page is honest. Trust in the counterparty is a business
  decision; validate the payloads you receive.
- **Client-side truth.** The demo's payment lock stops _accidental_ double
  submission. A hostile user can bypass any client-side state — money always
  needs server-side idempotency keys.

## Where to next

- [Cross-origin payments](../guides/cross-origin-payments.md) — the flow
  these gates protect, end to end.
- [`useOpenedWindow`](../hooks/use-opened-window.md) — the hook-level view
  of the same machinery.
- [How sync works](./how-sync-works.md) — the cross-origin handshake in
  sequence-diagram form.
