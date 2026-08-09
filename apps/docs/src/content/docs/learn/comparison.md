---
title: 'Compared to the alternatives'
description: 'use-everywhere compared to hand-rolled BroadcastChannel, localStorage events, Zustand, Jotai and Redux — what you would write instead, and what it would cost.'
sidebar:
  order: 5
---

There is a real question behind "should I use this", and it is not "is it
good". It is **what would I write instead, and what would that cost me**. So:
the alternatives, what each is actually good at, and where this library is the
wrong answer.

## vs. writing it yourself on `BroadcastChannel`

This is the honest baseline, and for a surprising number of apps it is the right
one. Two tabs, one flag, no conflicts:

```ts
const channel = new BroadcastChannel('theme');
channel.postMessage(theme);
channel.onmessage = (event) => setTheme(event.data);
```

That is twelve lines and no dependency. Ship it.

What it does not survive is the second week:

- **Two tabs write at once.** Last message wins, but "last" is delivery order,
  which differs per tab. They diverge, and nothing tells you.
- **A tab opens later.** It starts at its own initial value and stays wrong
  until someone writes again — there is no state, only events.
- **A tab is backgrounded.** Timers are clamped to once a minute; anything you
  built on an interval starts flapping.
- **A tab crashes** while holding the "I own the websocket" flag. Nothing hands
  it over. (Web Locks does this correctly, and is a _different_ API to learn.)
- **A tab is restored from bfcache.** It missed everything while frozen and does
  not know it.
- **A value stops being cloneable** — someone puts a function on the object —
  and the write throws in one tab and not the others.

That list is the library. It costs [about 1.8× a raw post](../under-the-hood/benchmarks.md)
and roughly 4 kB for the store.

**Use the platform directly when:** you are sending fire-and-forget events with
no state to converge, or you have exactly one writer.

## vs. `broadcast-channel` (the npm package)

The incumbent, and genuinely battle-tested — RxDB runs on it. It is a **pipe
with excellent fallbacks**: where `BroadcastChannel` does not exist, it reaches
for IndexedDB or `localStorage`, and it ships a leader-election module.

Where the two differ:

|                 | `broadcast-channel`              | use-everywhere                                            |
| --------------- | -------------------------------- | --------------------------------------------------------- |
| Model           | Pub/sub only                     | Pub/sub **and** a state model with per-key version clocks |
| Late joiners    | Nothing — you missed it          | hello/snapshot hydration                                  |
| Types           | Untyped messages                 | Typed message maps, optional schema validation            |
| React           | None                             | The hooks are the primary API                             |
| Leader election | Pre-Web-Locks                    | Web Locks where available, heartbeat where not            |
| Cross-origin    | Not its problem                  | Hardened window channel (origin, nonce, source, COOP)     |
| Fallbacks       | IndexedDB **and** `localStorage` | `storage` event, and it says so loudly                    |

**Use `broadcast-channel` when:** you need the IndexedDB fallback specifically —
an environment where `BroadcastChannel` and `localStorage` are both gone — or
you want a pipe and nothing else, in a codebase with no React.

## vs. Zustand (and its sync middlewares)

Not a competitor: a different axis. Zustand is _how you hold state in a page_.
This is _how state gets between pages_. Plenty of apps have both — a Zustand
store for the app, one shared key for the thing that has to be the same
everywhere.

The tab-sync middlewares (`shared-zustand`, `zustand-sync-tabs`, and the
`storage`-event persist recipes) are the comparable thing, and the difference is
granularity. They broadcast **the whole store**, so two tabs writing different
keys at the same time still conflict, and the loser's write disappears. Per-key
clocks are the entire point of the store here.

**Use a Zustand middleware when:** you already have Zustand, one key needs
syncing, and no two tabs will ever write concurrently.

## vs. Web Locks on its own

If all you want is "exactly one tab does this", `navigator.locks` is excellent
and you should use it:

```ts
navigator.locks.request('poller', () => forever());
```

The library's leader election _is_ Web Locks where the API exists. What it adds
is a fallback for where it does not (Web Locks needs a secure context — an
intranet app on plain http has none), a React binding that re-renders on
handover, and the seat being on the same bus as your state and presence, so
"who is leading" is answerable from any tab.

**Use Web Locks directly when:** leadership is all you need and you control the
deployment origin.

## vs. Yjs, Automerge, Liveblocks

A different problem, and worth being blunt about: **this is not a CRDT and does
not want to be.**

Those solve concurrent editing of shared documents — two people typing in one
paragraph, merged intent-preservingly, usually across a network. If you are
building a collaborative editor, use one of them.

This library solves one user, several tabs, one origin. Last-writer-wins with
version clocks is the right model for "which theme, which cart, which auth
state", and the wrong model for "which characters are in this paragraph". The
ceiling here is [`useSharedReducer`](../guides/counters-and-reducers.md),
which orders commutative operations through the leader so a counter cannot lose
increments. Past that, reach for a CRDT.

**Use a CRDT when:** two writers edit the same structure and both edits must
survive.

## vs. server-side state (TanStack Query, and friends)

If the state already lives on a server and tabs merely cache it, sync it there:
a websocket, or query invalidation, and every tab converges by refetching.
TanStack Query's `broadcastQueryClient` does exactly this for its cache, and it
is the right tool for server state.

What has no server to go to is **client** state: which tab owns the socket, who
is looking at this record right now, the wizard step you are on, whether you are
logged out. Those never leave the browser, and a round trip to prove two tabs
agree about a local fact is an odd way to spend a network.

**Use the server when:** the data is the server's anyway. **Use this when:** a
round trip would be the only reason a server was involved.

## The summary

Reach for use-everywhere when **more than one tab writes**, when a tab that
arrives late has to catch up, or when a tab going away has to be noticed —
crash included. Those three are the hard 20% everyone else rediscovers by
shipping bugs.

Anything else, use the smaller thing.
