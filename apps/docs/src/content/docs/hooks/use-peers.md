---
title: 'usePeers'
sidebar:
  order: 7
---

`usePeers` returns a live list of the _other_ tabs, windows, and workers
currently open on your origin. It's how you build "you have this open in
another tab" banners, presence dots, and "payment in progress in tab X"
notices — without inventing your own heartbeat protocol.

```tsx
import { usePeers } from 'use-everywhere';

function DuplicateTabBanner() {
  const peers = usePeers();
  const tabs = peers.filter((p) => p.kind === 'tab');
  if (tabs.length === 0) return null;
  return <p>This page is open in {tabs.length} other tab(s).</p>;
}
```

## Signature

```ts
function usePeers(options?: { name?: string }): readonly Peer[];
```

## Options

| Option | Type     | Default            | What it does                                                          |
| ------ | -------- | ------------------ | --------------------------------------------------------------------- |
| `name` | `string` | `'use-everywhere'` | Which bus to watch. Peers are counted per name — one bus, one roster. |

The default matches the default store name, so `usePeers()` with no arguments
sees every context that uses `useSharedState` with default options. If your
app runs its state on a named store, pass the same name here.

## Return value

A read-only array of peers — everyone on the bus _except you_:

```ts
interface Peer {
  id: string; // the peer's clientId — matches meta.clientId on its writes
  kind: PeerKind; // 'tab' | 'worker'
  lastSeen: number; // timestamp of its last sign of life
}
```

The component re-renders **only when a peer joins or leaves**, not on every
heartbeat — so rendering `peers.length` in your header costs nothing.

## How liveness works (the numbers to know)

- Every client announces itself on join, pings every **2 seconds**, and says
  goodbye on `pagehide` — so clean closes disappear from the list instantly.
- Any traffic counts as proof of life (a state patch, an event), so busy tabs
  never flicker offline.
- A peer silent for **5 seconds** is not dropped — it is **probed**. If it does
  not answer within a further **1 second**, it is removed. That's the crashed
  tab, which never gets to say goodbye.

The probe step exists because silence is not proof of death. Browsers clamp a
hidden tab's timers to roughly one tick a minute, so a perfectly healthy
backgrounded peer stops pinging on schedule. Dropping on silence alone made the
roster oscillate — dropped, re-added on its next slow ping, dropped again — once
a minute for a tab that was fine the whole time.

Message handlers are _not_ throttled, only timers are, so a hidden tab answers
the probe immediately and keeps its place. A peer that answers in time is never
removed at all: you see no membership change, not a drop followed by a re-add.
A tab returning to the foreground also re-announces itself, so anyone who did
give up on it re-adds it within a round trip.

Both numbers are tunable on the core API, which is where a presence engine can
be constructed with options:

```ts
import { createPresence } from '@use-everywhere/core';

const presence = createPresence('my-app', {
  pruneAfterMs: 5000, // silence before a peer is treated as suspect
  probeGraceMs: 1000, // how long it then has to answer
});
```

`usePeers` uses the defaults. A peer that is genuinely gone still disappears
within `pruneAfterMs + probeGraceMs`, and probing costs nothing while everyone
is talking — nothing looks suspect, so no probes are sent.

## Worked example: "payment in progress in another tab"

Combine peers with shared state to say _which_ tab holds a lock:

```tsx title="PaymentLockNotice.tsx"
import { usePeers, useClientId, useSharedState } from 'use-everywhere';

function PaymentLockNotice() {
  const [owner] = useSharedState<string | null>('pay-owner', null);
  const me = useClientId();
  const peers = usePeers();

  if (!owner || owner === me) return null;
  const stillOpen = peers.some((p) => p.id === owner);
  return (
    <p>
      Payment in progress in tab {owner.slice(0, 6)}
      {stillOpen ? '' : ' (that tab has closed)'}
    </p>
  );
}
```

Because state patches and presence share one client id per bus, the `owner`
written by another tab is directly comparable to the ids in `peers` — no
mapping table needed.

## Gotchas

- **You are not in the list.** `usePeers` is "who _else_ is here"; your own
  id comes from [`useClientId`](./use-client-id.md).
- **A crashed tab lingers up to ~5 seconds** before pruning. Design copy
  accordingly ("open in another tab" is fine; "guaranteed exactly one tab" is
  not — see the [single-flight recipe](../guides/recipes.md#the-duplicate-tab-lock-single-flight)
  for how to do locking with state instead).
- **Per name.** `usePeers({ name: 'checkout' })` and `usePeers()` watch
  different buses and can disagree — pick the bus your app actually uses.
- **SSR returns an empty array** (a frozen one, so the reference is stable).

## Where to next

- [`useClientId`](./use-client-id.md) — your own id on the bus.
- [Messages & presence guide](../guides/messages-and-presence.md) — presence
  in a fuller feature.
- [How sync works](../under-the-hood/how-sync-works.md#presence-heartbeats-with-piggybacking)
  — the heartbeat mechanics.
