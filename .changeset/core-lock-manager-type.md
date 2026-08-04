---
'@use-everywhere/core': minor
---

Export the `LockManagerLike` type, and document `LeaderOptions.locks` as the
supported test seam it now is: `@use-everywhere/test-utils` passes a
`FakeLockManager` there so several simulated tabs can queue on one seat, and so
a crashed tab's lock is reclaimed, in a plain test process.
