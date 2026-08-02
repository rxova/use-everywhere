---
'@use-everywhere/core': minor
---

Harden the core against the failure modes real tabs hit:

- **bfcache**: a tab restored from the back/forward cache now re-announces presence, re-runs the store's late-joiner handshake, and rejoins the leader election — previously it held silently stale state and a phantom seat until the next unrelated write.
- **All-or-nothing writes**: a value that cannot survive structured clone (a function, DOM node, or class instance smuggled into an object) now throws a `TypeError` naming the key _before_ touching local state — previously the local replica updated, the broadcast threw, and the tab silently diverged from every peer.
- **Crypto-grade ids**: client ids and window-channel nonces now come from Web Crypto (64-bit hex) instead of `Math.random().toString(36).slice(2, 8)`. The clientId is the LWW tie-breaker and the self-echo filter, and the nonce is a security boundary — a collision meant permanent silent divergence or mutual invisibility.
- **Idempotent `close()`** on every engine, and a shutdown guard on the shared bus: a double-closed channel can no longer shut the bus down underneath a sibling store.
- **Window channel**: a handshake timeout now tears the message listener down, so a child that connects late cannot revive a channel whose promises already rejected; the child side now validates `event.source` against the opener, mirroring the opener's own defense.
- **Persistence observability**: `webStorageAdapter` / `localStorageAdapter` / `sessionStorageAdapter` accept an `onError(error, operation)` callback — quota, blocked storage, and corrupt entries stay best-effort no-ops, but are no longer invisible.
- **Dev diagnostics**: development-only warnings for conflicting bus options (first creator wins) and for a second store on one name in one tab (they can never sync).
- **Dev-freeze fixes**: typed arrays no longer crash dev builds (freezing a non-empty view throws in every engine); Map/Set contents are now frozen; lazily registered initial values pass through the same guard as every other entry path.
- **Observer isolation**: a throwing `observeBus` observer is contained and reported instead of breaking the bus it watches.
- **Test-transport fidelity**: `MemoryHub` now structured-clones every delivery like the real BroadcastChannel — reference-identity payloads and non-cloneable values no longer pass in tests only to fail in production.

Size budgets were raised to absorb the new lifecycle and safety machinery (the whole-surface budget goes 4.5 kB to 5 kB brotlied).
