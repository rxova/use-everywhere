---
'use-everywhere': minor
---

Re-export the transport chain from the core: `StorageTransport`, `getTransportKind`, `isStorageEventAvailable`, and the `TransportKind` type. A browser with no `BroadcastChannel` now falls back to the `storage` event rather than silently sharing nothing, and `getTransportKind()` reports what is actually carrying traffic.
