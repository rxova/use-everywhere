---
sidebar_position: 3
---

# Limitations & FAQ

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
one of those cases persistence degrades to a **silent no-op** and the store
keeps working in memory. It will never be the thing that breaks your page —
which also means it is not a guarantee. Don't put anything you can't afford
to lose there; that's what your server is for.

## Leadership is advisory, not a distributed lock

[`useLeader`](../hooks/use-leader.md) elects one tab, and for a short window
— roughly one round trip, when two claims genuinely cross — two tabs can both
believe they hold the seat before one concedes.

That is fine for "don't open five WebSockets" and wrong for "don't charge the
card twice." Same energy as the note below about client-side locks: it is an
efficiency mechanism, not a safety one. Anything that must happen exactly once
needs a server-side idempotency key.

## A hidden tab can lose a lease it deserved to keep

Browsers throttle timers in backgrounded pages — to roughly 1 Hz, and harder
after a few minutes. A perfectly healthy leader that is merely _hidden_ can
therefore miss its heartbeats, get demoted by tabs that are still awake, and
run the cleanup in `useLeaderEffect`.

The 3-second default lease tolerates 1 Hz clamping. If the work is expensive
to restart, keep hidden tabs out of the running entirely:

```tsx
useLeader({ eligible: !document.hidden });
```

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

BroadcastChannel and `postMessage` have been universal for years (Safari ≥
15.4 for BroadcastChannel). No polyfills are bundled or needed for evergreen
browsers.

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
