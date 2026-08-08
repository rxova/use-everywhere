---
'@use-everywhere/core': minor
---

Elect on a namespaced Web Locks name

The Web Locks leader took a lock named after the bus, so `createLeader('notifications')` requested the lock `notifications` — a name in the application's own origin-wide keyspace. It is now `use-everywhere:leader:notifications`.

A bus name is used bare for a `BroadcastChannel`, and that stays: there a name genuinely is the identity, and a foreign channel of the same name is survivable because the bus drops anything that is not a wire of ours. A lock offers no such floor. It is an opaque mutex, so an application holding `notifications` for its own reasons left every tab leaderless for as long as it held — silently, with `waitForLeadership()` never resolving and no diagnostic the library could emit. Holding a lock for the lifetime of the tab is the ordinary Web Locks idiom, and a hand-rolled election on `navigator.locks` is exactly what a caller adopting `createLeader` is migrating away from, so the clash is on the adoption path rather than at its edges.

**During a rolling deploy, tabs on both versions can lead at once.** An old tab holds `notifications` while a new one holds `use-everywhere:leader:notifications`; both are granted, both announce, and peers see the seat flap between them. This is a genuine split brain, and the wire-protocol skew check does not catch it because the wire has not changed. It lasts only until the last old tab is gone, but if two leaders are costly for your workload — a socket that must be single, a job that must not run twice — drain old tabs before relying on the seat.

Nothing else changes: the bus name, the wire, and the heartbeat strategy are untouched.

One knock-on for tests. `createScenario().locks` is a general `navigator.locks` stand-in keyed by real lock names, so an assertion written as `browser.locks.holder('app')` now needs `browser.locks.holder('use-everywhere:leader:app')`. Asserting on `leader.getSnapshot().isLeader` instead is unaffected, and is the better assertion anyway — it is the thing under test rather than the mechanism beneath it.
