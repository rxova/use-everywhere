---
sidebar_position: 3
---

# Security model

use-everywhere has two very different security postures, matching its two
worlds. Knowing which one you are in tells you what the library checks for you
and what remains your job.

## Same origin: everyone is you

Everything on one origin — every tab, iframe from your domain, worker — runs
your code with your cookies. BroadcastChannel is already scoped to the origin
by the browser, so the same-origin engines add **no authentication at all**,
on purpose:

- Any code on your origin can join any bus, read state, and write patches.
- A compromised dependency on your page can too — but it could equally read
  `localStorage` or your DOM. The bus does not widen that blast radius.

The one same-origin knob is _filtering_, not security: `scope: 'tabs'` (or a
custom `accept` predicate on `createSharedStore`) lets a store ignore writes
from workers. That is a coordination tool — a worker is still your code.

:::warning Don't put secrets in shared state
State is broadcast to every context on the origin and lives in plain JS
memory. Treat it like you treat React state — fine for UI status, wrong for
raw card numbers or tokens that deserve tighter handling.
:::

## Cross origin: the other page is nobody

The window channel assumes the opposite: the page on the other side is a
different security principal, and `postMessage` is a public mailbox — any
window that holds a reference to yours can post to it, and by default a
listener cannot tell who sent what.

Every message a channel receives must pass **four gates** before your handler
sees it:

| Gate        | Check                                                                                             | Stops                                                          |
| ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Origin   | `event.origin === peerOrigin` (exact match, no wildcards)                                         | Any site you did not name                                      |
| 2. Envelope | payload carries the library brand (`__ue: 1`)                                                     | Unrelated `postMessage` traffic on the same page               |
| 3. Nonce    | `cid` equals the id minted for _this_ `openWindow()` call, delivered via the `?ue-cid=` URL param | Stale windows, replays from earlier sessions, guessed messages |
| 4. Source   | `event.source` is the exact `Window` we opened (opener side)                                      | A third frame on the _correct_ origin impersonating the child  |

Failing any gate drops the message silently — your handlers never run.

Outbound is symmetric: every `postMessage` is sent with an explicit
`targetOrigin`, so the browser refuses delivery if the window has meanwhile
navigated somewhere unexpected.

### `peerOrigin` is required, `'*'` throws

```ts
openWindow(url, { peerOrigin: 'https://pay.example.com' }); // ✅
openWindow(url, { peerOrigin: '*' }); // ❌ throws
```

A wildcard would disable gates 1 and the outbound `targetOrigin` check at
once. For local prototyping there is an explicit escape hatch —
`allowAnyOrigin: true` — named so that it cannot be mistaken for production
configuration. `openWindow` also cross-checks that the URL you open actually
belongs to `peerOrigin`, catching copy-paste mismatches at call time.

## Why shared state stops at the origin line

It is tempting to want `useSharedState` to just work across the payment
window too. The library refuses by design:

1. **Confused deputy.** State merging is automatic: whatever arrives with a
   newer clock wins. Automatic writes from a foreign principal into your
   application state is precisely how a compromised or buggy partner page
   would corrupt yours. Messages, by contrast, only do what your explicit
   handler does.
2. **Auditability.** A typed message map (`{ 'payment-complete': Receipt }`)
   is a reviewable contract between two domains. "Any key, any value, newest
   clock wins" is not.
3. **The shapes differ anyway.** Cross-origin flows are request/result shaped
   — open a window, exchange a handful of messages, get one result. A
   convergent replicated object buys nothing there.

## What the library does _not_ protect against

Be honest about the boundary:

- **Your own origin.** XSS on your page owns every bus. The library neither
  helps nor hurts.
- **The peer's content.** Gate 1 verifies _where_ a message came from, not
  that the payment page is honest. Trust in the counterparty is a business
  decision; validate the payloads you receive.
- **Client-side truth.** The demo's payment lock stops _accidental_ double
  submission. A hostile user can bypass any client-side state — money always
  needs server-side idempotency keys.
