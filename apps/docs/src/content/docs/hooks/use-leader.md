---
title: 'useLeader'
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

| what happens         | what you see                                                     |
| -------------------- | ---------------------------------------------------------------- |
| One tab, alone       | It leads after ~1 heartbeat (1s).                                |
| A second tab opens   | Crown **does not move**. The newcomer follows.                   |
| The leader is closed | Handed over **immediately** — it resigns on the way out.         |
| The leader crashes   | The seat is empty for `leaseMs` (3s), then a survivor claims it. |

The reason closing is instant and crashing is not: a tab that closes gets a
`pagehide` event and says so. A tab that is killed says nothing, and silence is
the only evidence the others have — so they must wait long enough to be sure.

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

Lower `leaseMs` for faster failover, at the cost of more false demotions when a
tab is throttled. The default tolerates a backgrounded tab's clamped timers.

## Leadership is advisory

This is **not a distributed lock**. There is a window of about one round trip
during which two tabs can both believe they lead — after a network-less
`BroadcastChannel` hiccup, or when two claims genuinely cross — and a
backgrounded tab whose timers are throttled can lose a lease it deserved to
keep.

That is fine for "don't open five sockets" and wrong for "don't charge the card
twice." Use it for efficiency, not for safety. See
[Limitations](../under-the-hood/limitations.md).
