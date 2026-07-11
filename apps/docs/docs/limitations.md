---
sidebar_position: 4
---

# Limitations & FAQ

The library is deliberately small. Most "missing" features are boundaries we
chose on purpose — here is where they are and what to do on the other side of
each.

## State does not survive the last tab

Replicas live in JS memory. Close every tab and the state is gone; reopen and
you start from initial values. Nothing touches `localStorage`, IndexedDB, or a
server.

**If you need persistence**: write through to storage yourself where the value
changes, and pass the stored value as the _initial_ — hydration semantics do
the rest (any live tab's newer value still wins over your stored one):

```tsx
const [draft, setDraft] = useSharedState('draft', localStorage.getItem('draft') ?? '');
useEffect(() => localStorage.setItem('draft', draft), [draft]);
```

## Last-writer-wins loses concurrent writes

Two tabs writing the same key at the same moment converge — by discarding one
write (see [How sync works](./concepts/how-sync-works.md)). Perfect for
status flags, wrong for merging concurrent edits to one text document. That
problem needs CRDTs (Yjs, Automerge) — out of scope by design.

Writes to _different keys_ never conflict, so splitting state across keys is
the cheap way to reduce collisions.

## Values must survive structured clone

Both transports serialize with the structured clone algorithm. Plain objects,
arrays, strings, numbers, `Map`, `Set`, `Date`, typed arrays: fine. Functions,
DOM nodes, class instances (their prototypes), React elements: not fine.
Keep shared state to serializable data — the same discipline as Redux.

## Same device, same browser only

BroadcastChannel spans one origin in one browser profile on one machine. It
does not reach the user's phone, their other browser, or incognito windows.
Cross-_device_ sync is a server problem; this library composes with whatever
you use there (its job ends at the tab boundary).

## No message history

Channel events are fire-and-forget. A tab that joins after `logged-out` fired
never sees it. This is why the [litmus test](./concepts/mental-model.md#the-three-same-origin-views)
matters: anything a late joiner must know belongs in state, which re-hydrates.

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

A BroadcastChannel is global to the origin; a React Provider could not scope
it any further, so it would be pure ceremony. Identity is the name string —
namespacing is `useSharedState('count', 0, { store: 'checkout' })`.

### How big is it?

The core is dependency-free and tree-shakeable; the React layer adds hooks
over `useSyncExternalStore`. There is no runtime, no scheduler, no worker
bundle — just the two browser primitives underneath.

### Can two different apps on the same origin interfere?

Yes — same origin, same name, same bus. That is occasionally a feature
(micro-frontends sharing session state) and occasionally a hazard; prefix
store names (`'myapp:cart'`) when you do not control the whole origin.

### When should I _not_ use this?

- Syncing across devices or users → server (WebSocket, SSE, polling).
- Collaborative editing with merge semantics → CRDT libraries.
- Durable offline data → IndexedDB (possibly _plus_ this, for live sync).
- One-tab apps → `useState` is right there.
