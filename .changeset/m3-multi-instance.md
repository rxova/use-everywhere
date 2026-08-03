---
'@use-everywhere/core': minor
---

Make several copies of the library on one page behave as one client.

A module-scoped registry is per _bundle_, not per page. Two micro-frontends that each bundled their own copy therefore each built their own bus, their own clientId, and their own presence entry — so one page appeared to its peers as two tabs, contended with itself for the leader seat, and could not share state within itself at all, because a post goes to the transport and no transport loops back to the context that made it.

Copies now find each other through a rendezvous point on `globalThis`, keyed by a versioned symbol, and share one bus per name: one identity, one presence entry, one leader seat. `getBus` returns a handle per call rather than the bus itself, so siblings release independently and the bus shuts down only when the last one lets go.

State and event wires are additionally delivered **synchronously** to sibling handles on the same page — the difference between two micro-frontends sharing a store and merely converging on it after a round trip. Presence and leader wires are not, because those are properties of a client and a page is one client.

Copies compiled against different rendezvous protocols cannot share live objects, so they partition — back to one client each, exactly as before this existed — and say so in development instead of leaving it to be discovered.

This also fixes two shared stores on one name in one page, which previously could never hear each other. The development warning for that case remains, because paying twice for one store's state, subscriptions, and persistence writes is still usually a mistake, but it no longer claims they will diverge.
