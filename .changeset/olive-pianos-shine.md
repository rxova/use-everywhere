---
'use-everywhere': minor
---

Re-export the core types a React caller needs to name

`useLeader({ locks })` is a valid call because `UseLeaderOptions extends
LeaderOptions`, and `SharedWorkerTransportOptions` was already re-exported — but
`LockManagerLike`, `SharedWorkerLike` and `MessagePortLike` were not, so a
React-only app could pass those values and type neither. Writing a SharedWorker
factory or a fake lock manager meant importing from `@use-everywhere/core`, a
package a React app is told it does not need to install.
