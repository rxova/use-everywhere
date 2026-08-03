---
'@use-everywhere/core': minor
---

Fall back instead of silently doing nothing when `BroadcastChannel` is missing.

`defaultTransport` used to hand back a `NoopTransport` in that case: every hook kept working, every write appeared to succeed, and nothing was ever shared with anybody. That is the worst failure this library can have, because it is indistinguishable from success.

The chain is now `BroadcastChannelTransport` → `StorageTransport` → `NoopTransport`, and every step down warns in development.

- **`StorageTransport`** rides a quirk of `localStorage`: writing fires a `storage` event in every _other_ same-origin tab and never in the writer — exactly the no-self-echo semantics the engines need. The entry is removed immediately after writing, so application state never lingers on disk. Fidelity is JSON rather than structured clone (a `Date` arrives as a string, a `Map` as `{}`), and values JSON cannot represent — functions, symbols — are **rejected rather than silently dropped**, preserving the all-or-nothing write guarantee.
- **`getTransportKind(name)`** answers "is anything even connected?" — `'broadcast-channel' | 'storage' | 'none' | 'custom'`, or `null` when no bus exists for that name. A plain function, not a hook: a bus picks its transport once and keeps it for the life of the page.
- **`isStorageEventAvailable()`** joins `isBroadcastChannelAvailable()`. It probes with a real write, because Safari's old private mode exposed a `localStorage` object that threw on every `setItem`.
- `Transport` gains an optional `kind`; the shipped transports declare theirs, and a custom one without it reports as `'custom'`.

Also: a presence engine attached to a bus that already existed now announces itself immediately rather than showing an empty roster until the next heartbeat.
