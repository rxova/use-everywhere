---
sidebar_position: 2
---

# Why this exists

Every few months I used to hit the same bug wearing a new costume.

A user opens checkout, gets impatient, opens checkout _again_ in a second
tab, and clicks **Pay** in both. Or they log out in one tab, and five other
tabs keep happily showing their inbox. Or a draft they typed in tab A simply
doesn't exist in tab B, and they email support asking where their text went.

These look like three different bugs. They're one bug: **each browser tab is
its own little universe.** Your carefully managed React state, your Redux
store, your Zustand atoms — all of it lives inside one tab, and the tab next
door has a completely independent copy that has never heard of yours. The
thing you called "application state" is actually "this tab's opinion about
application state," and the moment there are two tabs, the opinions disagree.

## What we all write today (and why it's still broken)

Let's make it concrete with the duplicate-tab payment, because it's the
scariest version. Here's the "standard" hand-rolled solution — I'm not
exaggerating for effect; versions of this live in production codebases
everywhere, including some I wrote:

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

Read that carefully, because the problems are instructive. We're juggling
**three different browser APIs**. We have **two sources of truth that can
disagree** — `localStorage` says paid while the channel said processing. And
after all that, it's _still_ broken: a tab opened mid-payment shows an
enabled Pay button, because `'processing'` was never persisted anywhere a
late joiner could find it. The user in that fresh tab can double-pay. The bug
we set out to fix is alive and well inside our fix.

The other folk solutions have their own warts, and you've probably met all
of them:

- **`localStorage` + `storage` events** — the classic. But it's
  stringly-typed (`JSON.parse` everywhere), the event doesn't fire in the tab
  that wrote, it doesn't reach workers at all, and you're using a
  _persistence_ API as a _messaging_ API, so you also inherit cleanup
  problems.
- **`SharedWorker`** — architecturally the "right" answer for a shared brain,
  but it's a separate compilation unit, DevTools support is rough, and you've
  now turned "sync a flag" into "maintain a worker protocol."
- **Polling** — `setInterval` + `localStorage.getItem`. I've seen it. You've
  seen it. We don't talk about it.

What I actually wanted is embarrassingly simple to state:

:::tip The spec, in one sentence
One object. Every tab. Writes anywhere show up everywhere, tabs opened later
see the current value, and simultaneous writes don't split-brain.
:::

## Why the platform alone doesn't get you there

The browser gives you two relevant primitives, and both are _almost_ enough.

**`BroadcastChannel`** is a named, origin-wide message bus — genuinely great,
and criminally underused. Any tab, window, iframe, or worker on your origin
can post to a named channel and hear everyone else. But it has three gaps,
and I'd argue these three bullets generate every line of cross-tab plumbing
ever written:

- **No history.** A message posted before you subscribed is gone forever. A
  freshly opened tab knows _nothing_ — that's the late-joiner problem, and
  it's why raw BroadcastChannel code always grows a `localStorage` sidecar.
- **No identity.** Messages don't say who sent them. Want to show "payment in
  progress in _the other_ tab"? You're inventing tab IDs yourself.
- **No conflict story.** Two tabs post "the new value is X" and "the new
  value is Y" at the same moment; different tabs can receive them in
  different orders — and disagree forever. That's a split brain.

**`window.postMessage`** is the only bridge between windows on _different_
origins — the checkout on `shop.example.com` talking to the payment window
on `pay.example.com`. It's deliberately shaped like a security API, and its
foot-guns have lost real money: `targetOrigin: '*'` delivering payment data
to whatever page is in the window now, `message` listeners that never check
`event.origin`, no "ready" signal (messages posted while the child loads are
silently dropped), and no way to tell a fresh window from a stale one.

## The tally

Here's what you actually hand-write around those two APIs, every single time:

| Need                            | The platform gives you         | You build                                 |
| ------------------------------- | ------------------------------ | ----------------------------------------- |
| Current value for a new tab     | nothing (no history)           | snapshot protocol or localStorage sidecar |
| Who sent this?                  | nothing                        | tab IDs                                   |
| Concurrent writes               | nothing                        | some conflict rule, usually "hope"        |
| Who else is open?               | nothing                        | heartbeats and timeouts                   |
| Wait for a child window to load | nothing                        | retrying ready handshake + queue          |
| Sender validation               | `event.origin`, `event.source` | the actual checks, in every listener      |
| Session binding                 | nothing                        | nonces                                    |
| "The window closed"             | nothing reliable               | polling `child.closed`                    |

That table _is_ the library. Every row, built once, tested, and hidden behind
a `useState`-shaped API. The same-origin rows become
[`useSharedState`](../hooks/use-shared-state.md),
[`useMessage`](../hooks/use-message.md), and
[`usePeers`](../hooks/use-peers.md); the cross-origin rows become
[`useOpenedWindow`](../hooks/use-opened-window.md).

## Where to next

- [Getting started](./getting-started.md) — the two-minute version, if you
  skipped ahead.
- [The mental model](./mental-model.md) — the two ideas everything else
  follows from.
- [How sync works](../under-the-hood/how-sync-works.md) — how version clocks
  and the late-joiner handshake actually close the gaps above.
- [Security model](../under-the-hood/security-model.md) — the four gates that
  defuse the postMessage foot-guns.
