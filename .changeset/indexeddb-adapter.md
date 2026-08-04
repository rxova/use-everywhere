---
'@use-everywhere/core': minor
---

Add `indexedDbAdapter` — persistence with room, and with real fidelity.

```ts
defineStore('workspace', { persist: indexedDbAdapter('workspace') });
```

Two things it has that `localStorage` does not.

**Fidelity, with no serializer at all.** IndexedDB stores values with the structured clone algorithm — the same one `BroadcastChannel` uses — so a `Date` comes back a `Date` and a `Map` a `Map`, for free. The whole JSON-degrades-your-types problem the `Serializer` seam exists to solve is simply not present here, and passing a serializer would only reintroduce it. That makes this the right home for state that is not JSON-shaped.

**Room.** `localStorage` is a few megabytes per origin, shared with everything else on it. IndexedDB is orders of magnitude larger.

And one thing it does not have: **a synchronous flush.** This is the adapter `store.hydrated` and `useHydrated` were built for — `read` resolves later, so the store is handed back before its state arrives, and a keystroke landing in that window is discarded by last-writer-wins when the restore turns up holding a higher counter. Gate first input on `hydrated`.

The same asymmetry applies on the way out: a `pagehide` flush cannot be awaited, so the last debounced write before a tab closes may not land. The debounce (`persist.debounceMs`, default 100) is the real protection — keep it short for state you would mind losing, or keep that state in `localStorageAdapter`, which writes synchronously, and the bulk here.

Failures degrade to a no-op and report through `onError`, like every other adapter: blocked storage, a corrupt record, a quota. An upgrade blocked by another tab holding the database open **rejects rather than hanging** — a promise nothing will settle would leave the store un-hydrated forever, with `hydrated` never resolving, which is worse than a reported failure.
