---
title: 'Why this exists'
description: 'Two tabs, one checkout, two charges. Why the browser needs multi-tab primitives that React and useState do not provide.'
sidebar:
  order: 3
---

The bugs are familiar. A user opens checkout in a second tab and clicks
**Pay** in both. A logout in one tab leaves five other tabs happily showing
the inbox. A draft typed in tab A doesn't exist in tab B.

They're all the same bug: **each browser tab runs its own copy of your
app.** In-tab state is a thoroughly solved space — React state, Redux,
Zustand, pick your favorite — but everything those tools manage lives inside
one tab. The tab next door holds an independent copy, and the moment there
are two tabs, "application state" is really "this tab's opinion about
application state."

## The part the platform already solved

Here's the honest starting point: the browser already ships very good APIs
for this.

- **`BroadcastChannel`** is a named, origin-wide message bus. Any tab,
  window, iframe, or worker on your origin can post to a channel and hear
  everyone else — structured-clone payloads, no polyfills, universal support.
- **`window.postMessage`** is the deliberate, security-shaped bridge between
  windows on _different_ origins — the only one there is, and a well-designed
  one.

These two APIs are exactly what runs under use-everywhere's hood. The
library doesn't replace them or work around them; it's built on the premise
that they're the right primitives.

## The gap

What's missing isn't transport — it's the abstraction. There is no
`useState`-shaped way to say "this value exists in every tab." Both APIs are
messaging primitives, and they intentionally leave the _state_ questions to
you: what a freshly opened tab should see (there's no history), who sent a
message (there's no identity), what happens when two tabs write at once
(there's no conflict rule), and, across origins, when the other window is
actually ready to listen.

So every team answers those questions in app code. For the duplicate-tab
payment, that typically looks like this:

```js
// 1. take a cross-tab lock so only one tab can pay
async function tryPay() {
  await navigator.locks.request('payment-48-291', { ifAvailable: true }, async (lock) => {
    if (!lock) return showBlocked();
    broadcastStatus('processing');
    await chargeCard();
    localStorage.setItem('paid-48-291', '1');
    broadcastStatus('paid');
  });
}

// 2. hand-wire a channel to tell other tabs
const bc = new BroadcastChannel('pay-48-291');
function broadcastStatus(s) {
  bc.postMessage({ s, tab: TAB_ID });
  applyStatus(s, TAB_ID); // BroadcastChannel doesn't echo to the sender
}
bc.onmessage = (e) => applyStatus(e.data.s, e.data.tab);

// 3. late joiner? BroadcastChannel has no history,
//    so ALSO check localStorage on load…
if (localStorage.getItem('paid-48-291')) applyStatus('paid');

// 4. …and listen for storage events as a fallback
addEventListener('storage', (e) => {
  if (e.key === 'paid-48-291') applyStatus('paid');
});

// 5. release / cleanup on unload, handle the lock holder
//    crashing mid-payment, sync disabled button state,
//    show WHICH tab is paying… 😩
```

This code is fine. That's worth saying plainly: it takes a lock, tells the
other tabs, gives late joiners a sidecar to read on load. With care and a
few tests, it's a perfectly correct solution — variants of it (swap in
`storage` events, or a `SharedWorker`) are running in production everywhere.

The question is whether you want to implement it _each time_. I don't. It's
three browser APIs and two sources of truth to keep agreeing, per feature —
and the edge cases (the tab opened mid-payment, the lock holder crashing,
cleanup on unload) each deserve their own test. All of that for what is,
from the product's point of view, one status flag. This is boilerplate in
the truest sense: necessary, repetitive, and identical in shape from app to
app — which is exactly what a library should absorb.

## use-everywhere minds that gap

I'd rather have something that wraps those primitives nicely, so that's
what this is:

:::tip[The spec, in one sentence]
One object. Every tab. Writes anywhere show up everywhere, tabs opened later
see the current value, and simultaneous writes don't split-brain.
:::

- **The whole snippet above becomes one hook** —
  `useSharedState('pay-status', 'idle')` — one source of truth instead of
  two, zero cleanup code.
- **Late joiners are handled.** A new tab hydrates to the current value from
  its first frame; initial values never overwrite real ones.
- **Conflicts resolve deterministically.** Simultaneous writes converge on
  the same winner in every tab — no split brain, no arbitration code.
- **Typed end to end.** State, events, and cross-origin messages are all
  checked against types you declare once.
- **Presence is built in.** "Who else has this open?" is a hook, not a
  heartbeat protocol you maintain.
- **The cross-origin channel ships the handshake and the validation** —
  ready signaling, queueing, origin checks, session nonces — that raw
  `postMessage` leaves to each listener.
- **It stays small and honest.** Zero dependencies, tree-shakeable, no
  runtime or worker bundle — the two platform APIs plus the state machinery
  they were missing. And everything is
  [testable without a browser](../guides/testing.md).

Row by row, this is the gap being closed:

| Need                            | The platform gives you         | Someone has to build                      |
| ------------------------------- | ------------------------------ | ----------------------------------------- |
| Current value for a new tab     | nothing (no history)           | snapshot protocol or localStorage sidecar |
| Who sent this?                  | nothing                        | tab IDs                                   |
| Concurrent writes               | nothing                        | some conflict rule, usually "hope"        |
| Who else is open?               | nothing                        | heartbeats and timeouts                   |
| Wait for a child window to load | nothing                        | retrying ready handshake + queue          |
| Sender validation               | `event.origin`, `event.source` | the actual checks, in every listener      |
| Session binding                 | nothing                        | nonces                                    |
| "The window closed"             | nothing reliable               | polling `child.closed`                    |

That table _is_ the library — every row built once, tested, and hidden
behind a `useState`-shaped API. The same-origin rows become
[`useSharedState`](../hooks/use-shared-state.md),
[`useOnMessage`](../hooks/use-on-message.md), and
[`usePeers`](../hooks/use-peers.md); the cross-origin rows become
[`useWindowResult`](../hooks/use-window-result.md).

## Where to next

- [Getting started](../index.md) — the two-minute version, if you skipped
  ahead.
- [The mental model](./mental-model.md) — the two ideas everything else
  follows from.
- [How sync works](../under-the-hood/how-sync-works.md) — how version clocks
  and the late-joiner handshake close the gaps above.
- [Security model](../under-the-hood/security-model.md) — how the
  cross-origin channel uses `postMessage` the way it was designed to be
  used.
