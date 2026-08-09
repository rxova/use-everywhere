---
title: 'Limitations & FAQ'
description: 'What use-everywhere deliberately does not do, and the questions that come up most — including why leader election is advisory rather than a lock.'
sidebar:
  order: 4
---

The library is deliberately small, and most "missing" features are
boundaries chosen on purpose — knowing a tool's edges is how you trust its
middle. Here's where each boundary is, why it's there, and what to use on
the other side of it.

## State does not survive the last tab — unless you ask it to

By default, replicas live in JS memory. Close every tab and the state is
gone; reopen and you start from initial values. Nothing touches
`localStorage` behind your back.

**If you want it to survive**, say so:

```tsx
import { defineStore, localStorageAdapter } from 'use-everywhere';

const settings = defineStore('settings', { persist: localStorageAdapter('app:settings') });
```

See [defineStore](../hooks/define-store.md).

Do **not** hand-roll it with a write-through effect:

```tsx
// Don't. This is subtly wrong.
const [draft, setDraft] = useSharedState('draft', localStorage.getItem('draft') ?? '');
useEffect(() => localStorage.setItem('draft', draft), [draft]);
```

Two things break. Every tab runs that effect, so N tabs race to write the
same key. And the stored string carries no version clock, so when you reopen,
the restored value re-enters the world at counter zero — it cannot win the
last-writer-wins race even when it genuinely is the newest thing anyone has.
`defineStore` persists the clocks along with the values, which is the whole
reason it converges.

## Persistence is best-effort

Storage can be unavailable: a sandboxed iframe, third-party cookies off, a
full quota, a corrupt entry left by an older version of your app. In every
one of those cases persistence degrades to a **no-op** and the store keeps
working in memory. It will never be the thing that breaks your page — which
also means it is not a guarantee. Don't put anything you can't afford to lose
there; that's what your server is for.

Best-effort does not have to mean invisible. Every built-in adapter takes an
`onError` callback, so you can measure how often it is failing for real users:

```ts
localStorageAdapter('settings', {
  onError: (error, operation) => telemetry.warn('persist', { operation, error }),
});
```

The callback is for observability only — the store's behaviour is identical
whether or not you pass it, and an `onError` that throws is swallowed.

## Leadership is advisory, not a distributed lock

[`useLeader`](../hooks/use-leader.md) elects one tab, and for a short window
— roughly one round trip, when two claims genuinely cross — two tabs can both
believe they hold the seat before one concedes.

That is fine for "don't open five WebSockets" and wrong for "don't charge the
card twice." Same energy as the note below about client-side locks: it is an
efficiency mechanism, not a safety one. Anything that must happen exactly once
needs a server-side idempotency key.

## A hidden tab can lose a lease it deserved to keep — on the heartbeat strategy

Browsers throttle timers in backgrounded pages — to roughly 1 Hz, and harder
after a few minutes. A leader that is merely _hidden_ can therefore miss its
heartbeats, get demoted by tabs that are still awake, and run the cleanup in
`useLeaderEffect`.

**This does not apply where Web Locks is available**, which is the default in
any secure context. Holding a lock does not depend on a timer, so a throttled —
or even fully frozen — tab keeps the seat. The lock is also released by the
browser itself when a tab dies, so there is no lease to wait out either.

Web Locks needs a secure context, so a plain-`http://` origin falls back to the
heartbeat election and inherits this caveat. There, the 3-second default lease
tolerates 1 Hz clamping; if the work is expensive to restart, keep hidden tabs
out of the running entirely:

```tsx
useLeader({ eligible: !document.hidden });
```

`leader.strategy` tells you which one you got.

## A hidden tab stays in the peer roster — it is asked, not assumed dead

The same throttling has a second victim. Presence treats any message from a peer
as proof of life, so the obvious rule is to drop peers that have gone quiet. But
a backgrounded tab's heartbeat is clamped to roughly one tick a minute, and it
is perfectly healthy — dropping it produces a peer count that oscillates once a
minute, forever, for a tab that never went anywhere.

What rescues it is that **browsers throttle timers, not message handlers**. A
hidden tab answers a `hello` the instant it arrives, however clamped its own
heartbeat is. So silence is treated as a question rather than a verdict: a peer
that has not spoken for `pruneAfterMs` is sent a probe, and only silence that
survives a further `probeGraceMs` removes it. One broadcast covers every suspect
at once, and a peer that answers in time is never removed at all — subscribers
see no membership change, not a drop followed by a re-add.

A returning tab also re-announces on `visibilitychange`, so peers that did give
up on it re-add it within a round trip instead of waiting out the next slow
heartbeat. That matters most after a laptop wakes, when every tab on the origin
is in that position simultaneously.

The defaults suit tabs, and [`usePeers`](../hooks/use-peers.md) uses them. Both
are tunable on the core API — tighten them for a UI that must notice a peer
leaving quickly:

```ts
createPresence('my-app', { pruneAfterMs: 5000, probeGraceMs: 1000 });
```

A peer that is genuinely gone still disappears, within `pruneAfterMs +
probeGraceMs`. Probes cost nothing while everyone is talking: nothing looks
suspect, so nothing is sent.

## Restoring from the back/forward cache is handled

Navigating away and pressing Back does not reload the page — the browser
freezes it and thaws it later. A frozen tab hears nothing, so on the way out it
announces `bye`, and everything it misses while cached would otherwise leave it
holding stale state and a leader seat it had already given up.

On a restore (`pageshow` with `persisted: true`) each engine rejoins: presence
re-announces itself, the store re-runs its late-joiner handshake and converges
on whatever the live tabs hold, and the leader re-enters the election — adopting
an incumbent that answers, or claiming the seat after one silent beat. Values
this tab holds that are genuinely newer still win, because the snapshot replies
pass through the same last-writer-wins gate as any other message.

Nothing to configure. Worth knowing because the symptom, if it were missing,
would be a tab that looks fine and is quietly wrong.

## Server rendering renders defaults, and nothing else

The hooks are safe to render on a server: there is no `window`, so no
transport is opened, no heartbeat is armed, and no election runs.
[`useSharedState`](../hooks/use-shared-state.md) renders its initial value,
[`usePeers`](../hooks/use-peers.md) an empty list,
[`useLeader`](../hooks/use-leader.md) no leader, and
[`useClientId`](../hooks/use-client-id.md) an empty string.

That is the only sensible answer — a server has no other tabs to ask — but it
means server-rendered markup shows defaults, and the real values arrive after
hydration. If a value must be correct in the first paint, it belongs in your
server's data, not here.

## The Inspector is a devtool, not a feature

[`<Inspector />`](../hooks/inspector.md) lives on the `use-everywhere/devtools`
subpath so it stays out of your bundle unless you import it. Guard it behind a
dev flag. It's built to observe without perturbing — it never joins the
election it displays — but it is not a supported UI surface, and its markup
and classnames are not a stable API.

## Last-writer-wins loses concurrent writes

Two tabs writing the same key at the same moment converge — by discarding
one write (see [How sync works](./how-sync-works.md)). Perfect for status
flags, counters, and drafts; wrong for merging concurrent edits to one text
document. That problem needs CRDTs (Yjs, Automerge) — out of scope by
design.

Writes to _different keys_ never conflict, so splitting state across keys is
the cheap way to reduce collisions.

## Values must survive structured clone

Both transports serialize with the structured clone algorithm. Plain
objects, arrays, strings, numbers, `Map`, `Set`, `Date`, typed arrays: fine.
Functions, DOM nodes, class instances (their prototypes), React elements:
not fine. Keep shared state to serializable data — the same discipline as
Redux.

A value that cannot cross the wire **throws, and the write does not happen**:

```ts
store.set('handlers', { onDone: () => {} });
// TypeError: the value for key "handlers" cannot cross the wire
// (structured clone failed); the write was not applied.
```

The rejection is all-or-nothing on purpose. The write is posted to the bus
before it is committed locally, so a value the browser refuses to clone leaves
your tab exactly as it was rather than updating locally and diverging silently
from every peer.

One asymmetry to know about: the wire uses structured clone, but the built-in
persistence adapters use `JSON.stringify`. A `Date` therefore syncs between
tabs as a `Date` and comes back from disk as a string, and `Map`/`Set` persist
as `{}`. Keep persisted values JSON-shaped until pluggable serializers land.

## Same device, same browser only

BroadcastChannel spans one origin in one browser profile on one machine. It
does not reach the user's phone, their other browser, or incognito windows.
Cross-_device_ sync is a server problem; this library composes with whatever
you use there — its job ends at the tab boundary.

## No message history

Channel events are fire-and-forget. A tab that joins after `logged-out`
fired never sees it. This is why
[the litmus test](../learn/mental-model.md#the-three-same-origin-views)
matters: anything a late joiner must know belongs in state, which
re-hydrates.

## Client-side locks are UX, not security

The [single-flight lock](../guides/recipes.md#the-duplicate-tab-lock-single-flight)
prevents _accidental_ double-pay by a confused user. A malicious user has
DevTools. Your server still needs idempotency keys — please don't let a
client library talk you out of them.

## FAQ

### Does it work in Safari / Firefox / Edge?

Yes, on all three, and the e2e suite runs against Chromium, Firefox and WebKit
on every change. BroadcastChannel and `postMessage` have been universal for
years (Safari ≥ 15.4 for BroadcastChannel). No polyfills are bundled or needed.

Where `BroadcastChannel` is genuinely missing, tabs still sync: the library
falls back to a `storage`-event transport, warning in development that values
now serialise as JSON rather than structured clone. Only when storage is
blocked too — a sandboxed iframe, third-party cookies off — does sharing stop,
and that warns as well. `getTransportKind(name)` tells you which case you are
in. See [Transports](../core/transports.md).

### What about iframes?

A same-origin iframe joins buses like any tab. A _cross-origin_ iframe is a
different principal — the window channel's opener/child model targets popups
(`window.open`), so for embedded iframes today you would wire `postMessage`
yourself or open a popup instead.

### Why is there no Provider?

A BroadcastChannel is already global to the origin; a React Provider could
not scope it any further, so it would be ceremony without meaning. Identity
is the name string — namespacing is
`useSharedState('count', 0, { store: 'checkout' })`.

### What happens to shared state when a component unmounts?

Nothing is disposed. Unmounting only removes that component's subscription;
the store behind the hook is a module-level singleton that lives for the
page lifetime. It keeps the value and its version clocks, stays on the bus,
and keeps answering late-joiner handshakes — even while _no_ component is
subscribed. Remounting reads the current value straight from the store, not
your `initial` (key registration is first-wins, so re-registering is a
no-op).

If you drive the core directly and really want to tear a store down,
`store.close()` unsubscribes it and releases the bus. The React layer never
calls it — a value shouldn't vanish from other tabs because one tab's UI
happened to unmount.

### What happens when a tab closes — or the last one does?

Every tab holds a full replica, so a closing tab takes only _its copy_ with
it: it says goodbye on `pagehide`, drops off the bus, and presence prunes
it. As long as one same-origin context (tab, window, or worker) is still
open, the state lives there, and the next tab to open hydrates from it via
the [snapshot handshake](./how-sync-works.md).

When the _last_ one closes, the state is gone — replicas are JS memory, and
there is deliberately no storage underneath. A later tab broadcasts `hello`,
nobody answers, and it starts from initial values. If that matters for your
data, use the write-through pattern in
[State does not survive the last tab](#state-does-not-survive-the-last-tab--unless-you-ask-it-to).

### How big is it?

The core is dependency-free and tree-shakeable; the React layer adds hooks
over `useSyncExternalStore`. There is no runtime, no scheduler, no worker
bundle — just the two browser primitives underneath.

### Can two different apps on the same origin interfere?

Yes — same origin, same name, same bus. That's occasionally a feature
(micro-frontends sharing session state) and occasionally a hazard; prefix
store names (`'myapp:cart'`) when you don't control the whole origin.

### When should I _not_ use this?

- Syncing across devices or users → server (WebSocket, SSE, polling).
- Collaborative editing with merge semantics → CRDT libraries.
- Durable offline data → IndexedDB (possibly _plus_ this, for live sync).
- One-tab apps → `useState` is right there.

## Where to next

- [Why this exists](../learn/why.md) — the problems the library _does_
  solve, and the plumbing it replaces.
- [How sync works](./how-sync-works.md) — the machinery behind the
  trade-offs on this page.
- [Recipes](../guides/recipes.md) — patterns designed around exactly these
  boundaries.
