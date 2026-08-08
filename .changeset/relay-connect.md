---
'@use-everywhere/core': minor
---

`startRelay` now returns a `Relay`, and `@use-everywhere/core/shared-worker` exports the `relay` it installs on import — so a SharedWorker that owns the WebSocket can publish what arrives on it.

`relay.connect()` hands back a `Transport`, which means worker-side code uses `createSharedStore` exactly as a tab does, late-joiner handshake included, and never has to hand-assemble an envelope the wire protocol might redefine. `relay.broadcast(data)` is the raw escape hatch, and `relay.size` counts the attached ports, for idling work while no tab is looking.

Previously the shipped relay could only forward between ports: a worker hosting it had no way to originate a message, so "the worker owns the socket" needed a second bus over `BroadcastChannel` and a separate handle to keep the worker alive. Now one port does both.

Additive — `startRelay` keeps its signature and the import side effect is unchanged.
