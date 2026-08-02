---
'use-everywhere': minor
---

Inherit the hardened core: bfcache-safe state and leadership, all-or-nothing writes that can no longer diverge a tab from its peers, crypto-grade client ids, idempotent teardown, and the new `onError` option on the persistence adapters (re-exported from `@use-everywhere/core`).

No React API changed. Client ids are now 64-bit hex rather than six base-36 characters, so anything asserting on their shape — `useClientId`, peer ids from `usePeers` — sees the new format. Size budgets were raised to match the core's added safety machinery.
