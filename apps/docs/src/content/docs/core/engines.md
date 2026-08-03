---
title: 'Engines'
sidebar:
  order: 2
---

Four factories. Each is exactly what the matching hook uses internally — the
hook adds `useSyncExternalStore` and a singleton registry, nothing else.

## createSharedStore

```ts
import { createSharedStore } from 'use-everywhere';

const store = createSharedStore('settings', { theme: 'light' });

store.set('theme', 'dark'); // syncs to every tab
store.state.theme = 'dark'; // same thing — the proxy writes through
store.getSnapshot(); // frozen, referentially stable
store.getVersions(); // the per-key clocks behind it

const off = store.subscribe((key, value, meta) => {
  if (!meta.self) console.log(`${meta.clientId} set ${key}`);
});

store.close();
```

`subscribe` fires for **local and remote** writes; `meta.self` tells you which.
That's how you build an audit log, or mirror changes into another system.

`subscribeKey(key, fn)` is the narrow version the hooks use — it fires only when
that one key changes, which is what keeps a component from re-rendering because
some unrelated key moved.

Options: `accept` (a gatekeeper for incoming writes), `persist`
(see [defineStore](../hooks/define-store.md)), `transport`, `kind`.

## createChannel

Fire-and-forget typed events. Not state — nothing is retained, and a tab that
joins later hears nothing.

```ts
import { createChannel } from 'use-everywhere';

type Events = { 'cart-updated': { items: number } };
const channel = createChannel<Events>('shop');

const off = channel.on('cart-updated', (payload, meta) => {
  console.log(payload.items, 'from', meta.clientId);
});

channel.post('cart-updated', { items: 3 }); // never echoed to self
channel.close();
```

## createPresence

```ts
import { createPresence } from 'use-everywhere';

const presence = createPresence('app');
presence.getPeers(); // [{ id, kind, lastSeen }, …] — others, never yourself
presence.subscribe(() => render(presence.getPeers()));
presence.close();
```

Any message from a peer counts as a liveness signal — state patches and events
piggyback on the same bus, so a chatty tab is never mistaken for a dead one.
Silence past `pruneAfterMs` (default 5s) removes a peer; closing a tab sends an
explicit goodbye, so it disappears at once.

## createLeader

```ts
import { createLeader } from 'use-everywhere';

const leader = createLeader('feed', { eligible: true });

leader.getSnapshot(); // { leaderId, isLeader } — frozen, stable
leader.subscribe(() => {
  if (leader.getSnapshot().isLeader) startPolling();
  else stopPolling();
});

leader.setEligible(false); // stand down; stop being a candidate
leader.resign(); // give up the seat now, stay a candidate
leader.close();
```

The snapshot is a **new object only when the leader actually changes** — a
heartbeat confirming the incumbent mints nothing and wakes no listener. That's
what makes it safe to feed straight into `useSyncExternalStore`.

See [useLeader](../hooks/use-leader.md) for how the seat moves, and why
leadership is advisory rather than a lock.

## Options every engine takes

```ts
createChannel('name', {
  transport: (name) => new MemoryHub().connect(), // swap the wire (from '/testing')
  kind: 'worker', // what this client calls itself
});
```

`kind` defaults to `'tab'`, or `'worker'` when there's no `document`. It's what
`accept` and `usePeers` filter on.

:::caution[One engine per name per tab]
Two stores with the same name in one tab would share a bus and a `clientId`, and
a post is never looped back locally — so they would be **deaf to each other**.
The React registry memoises for exactly this reason. Outside React, create one
and pass it around.
:::
