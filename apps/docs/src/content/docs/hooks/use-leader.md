---
title: 'useLeader'
description: 'Elect exactly one tab to own the WebSocket, the polling loop or the token refresh — and hand the seat over when that tab closes.'
sidebar:
  order: 10
---

Your app is open in five tabs. Each one opens a WebSocket, each one polls
`/notifications` every ten seconds, each one races the others to refresh the
expiring auth token. That's five sockets and five refreshes where you wanted
one.

`useLeader` elects exactly one tab to do the work. The others stand by, and if
the elected tab goes away, another one picks the job up.

```tsx
import { useLeaderEffect } from 'use-everywhere';

function LiveFeed() {
  useLeaderEffect(() => {
    const socket = new WebSocket('wss://example.com/feed');
    return () => socket.close();
  });

  return <Feed />;
}
```

That's the whole thing. `useLeaderEffect` runs the effect **only in the tab
holding the seat**, and runs the cleanup when that tab loses it. Every tab still
renders `<Feed />` — they just read the state the leader writes, which is what
`useSharedState` is for.

## The three hooks

```tsx
const { leaderId, isLeader } = useLeader(); // who holds the seat
const isLeader = useIsLeader(); // just the boolean
useLeaderEffect(() => {
  /* … */
}); // run only if we hold it
```

`leaderId` is `null` while the seat is empty — briefly on startup, and again for
about a lease after a leader crashes.

## How the seat moves

The incumbent is **sticky**. Opening a new tab does not disturb it: the sitting
leader answers the newcomer's hello immediately, so the newcomer adopts it
rather than starting an election. There is no leaderless flash, and no churn.

| what happens         | Web Locks                             | heartbeat                                      |
| -------------------- | ------------------------------------- | ---------------------------------------------- |
| One tab, alone       | Leads as soon as the lock is granted. | Leads after ~1 heartbeat (1s).                 |
| A second tab opens   | Queues behind the holder.             | Crown **does not move**. The newcomer follows. |
| The leader is closed | Handed over **immediately**.          | Handed over **immediately** — it resigns.      |
| The leader crashes   | Handed over **immediately**.          | Seat empty for `leaseMs` (3s), then claimed.   |
| The leader is hidden | Keeps the seat.                       | May be demoted once its timers are clamped.    |

On the heartbeat strategy, closing is instant and crashing is not: a tab that
closes gets a `pagehide` event and says so, while a tab that is killed says
nothing — and silence is the only evidence the others have, so they must wait
long enough to be sure. Web Locks removes the distinction, because releasing the
lock is the browser's job rather than the dying tab's.

## Two strategies, picked for you

`useLeader` arbitrates the seat with the **Web Locks API** where it exists, and
falls back to a **lease-and-claim heartbeat** where it does not. Web Locks needs
a secure context, so the fallback is what runs on a plain-`http://` origin — an
intranet app, a LAN staging box — not some legacy corner.

Web Locks is better on every axis that matters here: the browser owns the queue,
so failover is immediate even on a crash; holding the lock depends on no timer,
so a backgrounded tab cannot be deposed for being throttled; and there is no
periodic announce traffic at all.

You do not have to choose. `strategy: 'heartbeat'` forces the fallback (useful
when reproducing a bug), `strategy: 'web-locks'` throws rather than silently
degrading if locks are unavailable, and `leader.strategy` reports what you got.

## Awaiting the seat

For imperative code — outside React, or in an effect — `waitForLeadership()`
resolves when this tab holds the seat, immediately if it already does:

```ts
const leader = getLeader('feed');
await leader.waitForLeadership();
startTheExpensiveThing();
```

It rejects if the leader is closed while you are still waiting, so an `await` in
a tab being torn down does not hang forever.

## Opting a tab out

Eligibility is a property of the **tab**, not of a component. Set it in one
place:

```tsx
// This tab watches, but will never be asked to do the work.
const { leaderId } = useLeader({ eligible: false });
```

A common pattern is to keep background tabs out of the running, since their
timers are throttled:

```tsx
useLeader({ eligible: !document.hidden });
```

Because it's a per-tab property, a component that just reads `useLeader()`
without passing `eligible` will not re-enrol a tab that opted out.

## Tuning

```tsx
useLeader({
  name: 'feed', // which bus to elect on
  heartbeatMs: 1000, // how often the leader re-announces
  leaseMs: 3000, // how long followers tolerate silence
});
```

`heartbeatMs` and `leaseMs` apply to the heartbeat strategy only — there is
nothing to tune when the browser owns the queue. Lower `leaseMs` for faster
failover, at the cost of more false demotions when a tab is throttled. The
default tolerates a backgrounded tab's clamped timers.

## Leadership is advisory

This is **not a distributed lock** for your business rules, even on the Web
Locks strategy. The lock guarantees one holder per name in this browser profile
— it says nothing about the user's other devices, other browsers, or your
server. On the heartbeat fallback the guarantee is weaker still: there is a
window of about one round trip during which two tabs can both believe they lead
— when two claims genuinely cross — and a backgrounded tab whose timers are
throttled can lose a lease it deserved to keep.

That is fine for "don't open five sockets" and wrong for "don't charge the card
twice." Use it for efficiency, not for safety. See
[Limitations](../under-the-hood/limitations.md).
