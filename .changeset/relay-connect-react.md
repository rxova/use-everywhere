---
'use-everywhere': minor
---

Mirror the relay handle at `use-everywhere/shared-worker`: `relay` and the `Relay` type join the existing `startRelay` re-export, so a React app whose SharedWorker owns the WebSocket still needs only one dependency to publish from it.
