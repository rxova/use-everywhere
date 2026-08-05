---
'use-everywhere': minor
---

Re-export `SharedWorkerTransport` / `isSharedWorkerAvailable`, and mirror the relay at `use-everywhere/shared-worker`, so a React app still needs one dependency to put its bus in a SharedWorker.
