---
title: 'useClientId'
description: "This tab's identity on a bus: the id that stamps every state patch and event it sends."
sidebar:
  order: 8
---

`useClientId` returns this tab's identity on a bus — the same id that stamps
every state patch and event this tab sends. It answers "which one am I?" so
that "this tab wrote it", "this tab holds the lock", and "this presence dot
is me" all agree.

```tsx
import { usePeers, useClientId } from 'use-everywhere';

function TabStrip() {
  const me = useClientId();
  const peers = usePeers(); // everyone except me
  return (
    <p>
      me: {me} · also here: {peers.map((p) => `${p.kind} ${p.id}`).join(', ') || 'nobody'}
    </p>
  );
}
```

## Signature

```ts
function useClientId(options?: { name?: string }): string;
```

## Options

| Option | Type     | Default            | What it does                                                        |
| ------ | -------- | ------------------ | ------------------------------------------------------------------- |
| `name` | `string` | `'use-everywhere'` | Which bus's id to return. One bus per name, one id per bus per tab. |

## Return value

A 16-character hex string from `crypto.getRandomValues`, stable for the life of
the page. It is:

- the `id` other tabs see for you in [`usePeers`](./use-peers.md),
- the `meta.clientId` other tabs receive with your
  [events](./use-on-message.md) and state patches,
- new on every full page load (it identifies a _page instance_, not a user or
  a browser).

**On the server it is the empty string.** An id invented during server
rendering could never match the one the browser mints, so rendering it into
markup would mismatch on hydration. The hook returns `''` for the server render
_and_ for the client's hydrating render, then the real id arrives in the commit
immediately after. Treat `''` as "not known yet":

```tsx
const me = useClientId();
if (!me) return <Placeholder />; // first paint under SSR
```

Without SSR — a plain Vite or CRA app — you will never observe `''`.

## Worked example: claiming a lock you can recognize

The id's whole job is being comparable across features. Here a tab claims a
lock in shared state, and every tab — including the claimant — can tell whose
it is:

```tsx title="useSingleFlight.ts (excerpt)"
const me = useClientId();
const [owner, setOwner] = useSharedState<string | null>('export:owner', null);

const claim = () => setOwner(me);
const mine = owner === me; // am I the one exporting?
const held = owner !== null; // is anyone?
```

See the full pattern in the
[single-flight recipe](../guides/recipes.md#the-duplicate-tab-lock-single-flight).

## Gotchas

- **Match the name.** Ids are per bus: comparing `useClientId()` (default
  bus) against `meta.clientId` from a channel named `'auth'` compares ids
  from two different buses. Use the same `name` everywhere you want the ids
  to line up.
- **Not persistent, not secret.** A refresh mints a new id, and any code on
  your origin can read it. It's a coordination handle, not authentication.

## Where to next

- [`usePeers`](./use-peers.md) — the other side of the roster.
- [The mental model](../learn/mental-model.md#what-a-name-really-is) — why
  one bus has one id, and why that's load-bearing.
