---
title: 'Playground'
sidebar:
  order: 6
---

Every frame below is a real client: same origin, same `BroadcastChannel`, no
coordination between them except the bus. Change the cart in one and watch the
others. Open **this page in a second browser window** and those frames join in
too — they are not simulated, and neither is anything else here.

<iframe
  src="../../playground/index.html"
  title="Interactive multi-tab playground"
  style="width:100%;height:470px;border:1px solid var(--sl-color-gray-5);border-radius:10px;background:#010409"
  loading="lazy"
></iframe>

## Things worth trying

**Type in the note field of two frames at once.** Both writes land; the later
one wins the key and every frame agrees on which. That is last-writer-wins with
per-key version clocks — not "last message delivered", which differs per frame
and would leave them disagreeing forever.

**Open a new tab after the cart is at 7.** It arrives at 7, not at 0. A joiner
says hello and one peer — exactly one — answers with a snapshot.

**Watch the crown.** Exactly one frame leads. Close that one with _close the
last one_ and the seat moves at once: a clean close resigns on the way out.

**Now press `crash` instead.** That frame cuts its wire without saying goodbye —
no `bye`, no resignation, which is what a killed tab looks like from the
outside. Nothing happens for a moment. Then the lease expires and a survivor
takes the seat, and the roster drops the dead frame. The pause _is_ the
demonstration: peers have to notice, because nobody told them.

## The code in each frame

Written with the hooks, which is what you would write:

```tsx
const [items, setItems] = useSharedState('items', 0);
const [note, setNote] = useSharedState('note', '');
const peers = usePeers({ includeSelf: true });
const { isLeader } = useLeader();
```

That is the whole app — the frames really do run those hooks.

Three differences from what you would ship, all deliberate:

- `crash` is stagecraft. A frame here is very much alive, so before importing
  the library it wraps `BroadcastChannel` and keeps a reference to every channel
  the library opens; crashing makes them mute and deaf. From every other frame's
  point of view that is indistinguishable from a tab that died. Your app needs
  none of this: a real crash cuts the wire for you.

- The election is pinned to `strategy: 'heartbeat'` with a short lease. A frame
  that crashes here is still running, and Web Locks releases a lock when the
  context _dies_ — so the browser would keep handing the seat to a frame that
  can no longer use it, and the most interesting moment would show nothing.
  Under the lease, silence loses the seat, which is what you can watch happen.
  In your app, leave it on `auto`: where Web Locks exists, the handover is
  immediate and needs no lease at all.
- Presence is created with `includeSelf: true`, so the count reads as "how many
  of us are here" rather than the default "who else is here".

## Where to next

- [The mental model](./mental-model.md) — why one bus, and why per-key clocks.
- [Compared to the alternatives](./comparison.md) — what you would write
  instead, and what it would cost.
- [Testing](../guides/testing.md) — how to assert all of this without opening a
  single browser window.
