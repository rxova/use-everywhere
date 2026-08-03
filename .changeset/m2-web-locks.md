---
'@use-everywhere/core': minor
---

Elect the leader with the Web Locks API where it exists.

The heartbeat election has to infer that a leader is gone from silence, which is why it needs a lease — and why a backgrounded tab whose timers are clamped can be deposed while perfectly healthy, running the teardown in `useLeaderEffect` for no reason. With `navigator.locks` the browser owns the queue instead: failover on a crash is immediate rather than lease-length, holding the seat depends on no timer at all, and there is no periodic announce traffic.

`strategy` defaults to `'auto'` — Web Locks when available, heartbeat otherwise. Web Locks is a **secure-context** API, so a plain-`http://` origin (an intranet app, a LAN staging box) keeps the heartbeat election; that fallback is load-bearing, not legacy. Pass `strategy: 'heartbeat'` to force it, or `strategy: 'web-locks'` to fail loudly rather than degrade silently. `leader.strategy` reports which one is in use.

Also adds `waitForLeadership()`, which resolves when this client holds the seat (immediately if it already does) and rejects if the leader is closed while waiting, so an `await` in a tab being torn down cannot hang.

One behavioural difference worth knowing: on the Web Locks strategy a lone eligible tab that calls `resign()` is handed the seat straight back, because re-queuing finds nobody else waiting. `resign()` moves the seat when there is somewhere for it to move.
