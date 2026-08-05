---
'@use-everywhere/core': minor
---

Add `SharedWorkerTransport` and the relay it talks to (`@use-everywhere/core/shared-worker`), so a bus can run through one worker per origin instead of a channel between N tabs. The point is a place that is not a tab: the relay can own the socket that leadership used to be needed for. Opt-in — `BroadcastChannel` stays the default — and `isSharedWorkerAvailable()` reports the contexts (dedicated workers, Chrome for Android) where the constructor would throw.
