---
sidebar_position: 3
---

# Limitations & FAQ

Every library pitch needs an honesty section, and this is mine. The library
is deliberately small, and most "missing" features are boundaries I chose on
purpose — knowing a tool's edges is how you trust its middle. Here's where
each boundary is, why it's there, and what to use on the other side of it.

## State does not survive the last tab

Replicas live in JS memory. Close every tab and the state is gone; reopen
and you start from initial values. Nothing touches `localStorage`,
IndexedDB, or a server — the library won't persist things behind your back.

**If you need persistence**: write through to storage yourself where the
value changes, and pass the stored value as the _initial_ — hydration
semantics do the rest (any live tab's newer value still wins over your
stored one):

```tsx
const [draft, setDraft] = useSharedState('draft', localStorage.getItem('draft') ?? '');
useEffect(() => localStorage.setItem('draft', draft), [draft]);
```

## Last-writer-wins loses concurrent writes

Two tabs writing the same key at the same moment converge — by discarding
one write (see [How sync works](./how-sync-works.md)). Perfect for status
flags, counters, and drafts; wrong for merging concurrent edits to one text
document. That problem needs CRDTs (Yjs, Automerge) — out of scope by
design, and I'd rather say so plainly than pretend.

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
[State does not survive the last tab](#state-does-not-survive-the-last-tab).

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
