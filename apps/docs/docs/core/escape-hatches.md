---
sidebar_position: 6
---

# Escape hatches

The bits that let non-React code reach into what the hooks are doing — and the
errors you can catch.

## Reaching the hooks' instances

The hooks memoise one engine per name for the page. These hand you the _same_
instance, not a new one:

```ts
import { getSharedStore, getLeader, DEFAULT_NAME } from 'use-everywhere';

getSharedStore(); // the store behind a bare useSharedState()
getSharedStore('settings'); // …behind useSharedState(k, v, { store: 'settings' })
getSharedStore('settings', 'tab'); // a different scope is a different store
getLeader('feed'); // the Leader behind useLeader({ name: 'feed' })
```

This is how you write to shared state from outside a component — an event
handler in a plain module, a service worker message, a Zustand middleware:

```ts
// Nowhere near React. Every tab sees it.
getSharedStore('session').set('loggedIn', false);
```

`DEFAULT_NAME` is the string the hooks default to (`'use-everywhere'`), exported
so you can target the same bus without hard-coding it.

:::warning `defineStore` must come first
If a store needs [persistence](../hooks/define-store.md), `defineStore` has to
run before anything creates it — and `getSharedStore(name)` **creates it**. Call
`defineStore` at module scope. If it runs too late it throws, rather than
quietly handing you back a store that isn't persisted.
:::

## Errors

Both are real classes, so `instanceof` works:

```ts
import { WindowClosedError, HandshakeTimeoutError } from 'use-everywhere';

try {
  const receipt = await pay.result;
} catch (err) {
  if (err instanceof WindowClosedError) {
    // The user closed the payment window before finishing.
  }
  if (err instanceof HandshakeTimeoutError) {
    // The opened page never called connectToOpener — wrong URL, or it crashed.
  }
}
```

`useOpenedWindow` catches these for you and turns them into render state
(`status: 'closed-early'`), so you only need them if you're driving `openWindow`
by hand.

## CID_PARAM

The query-string parameter (`ue_cid`) that `openWindow` appends to the child's
URL to carry the connection nonce. Exported because the child page may want to
strip it before it ends up in analytics or a history entry:

```ts
import { CID_PARAM } from 'use-everywhere';

const url = new URL(location.href);
url.searchParams.delete(CID_PARAM);
history.replaceState(null, '', url);
```

Don't try to _forge_ it. It's one of four things the child validates — origin,
envelope brand, nonce, and source window — and none of them are optional. See
the [security model](../under-the-hood/security-model.md).

## Types worth knowing

|                  |                                                                         |
| ---------------- | ----------------------------------------------------------------------- |
| `Version`        | `[counter, clientId]` — see [the clock](./clock.md)                     |
| `MessageMeta`    | `{ clientId, kind, self }` — who sent it, and whether it was you        |
| `Peer`           | `{ id, kind, lastSeen }`                                                |
| `PeerKind`       | `'tab' \| 'worker' \| (string & {})` — open, so you can invent your own |
| `MessageMap`     | The shape you parameterise channels with                                |
| `BusWire`        | The discriminated union of everything on the bus                        |
| `PersistAdapter` | Bring your own storage — see [defineStore](../hooks/define-store.md)    |
