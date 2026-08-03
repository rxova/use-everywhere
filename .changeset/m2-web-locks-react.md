---
'use-everywhere': minor
---

`useLeader` inherits the Web Locks election from the core: in any secure context a hidden or throttled tab keeps the seat, and failover after a crash is immediate rather than lease-length. Plain-`http://` origins keep the heartbeat election. Re-exports the new `LeaderStrategy` type; `getLeader(name).waitForLeadership()` is available for imperative code.
