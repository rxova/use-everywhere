---
'@use-everywhere/core': minor
---

Add createLeader(name, options): opt-in leader election so exactly one tab owns the socket, the polling loop, or the token refresh. Lease-and-claim with a sticky incumbent — a new tab adopts the current leader instead of stealing the seat, a closing tab hands it over immediately, and a crashed one is replaced after the lease. Terms reuse the same newer() clock as the store, so crossing claims resolve deterministically. Leadership is advisory, not a distributed lock.
