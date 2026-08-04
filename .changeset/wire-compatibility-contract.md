---
'@use-everywhere/core': minor
---

Make version skew a fact you can see rather than one you have to deduce.

Every deploy puts two versions of your app on one origin for as long as it takes users to reload, both on the same bus. Wires from another protocol version were already dropped safely at the envelope — but dropped is all they were, which is indistinguishable from the peer having nothing to say. A tab could spend an afternoon sharing state with half the origin and never find out.

- **`getWireSkew(name)`** returns the foreign wire protocol versions heard on a bus, ascending. Empty is the normal case; non-empty means this page is partitioned from those peers by design, and is what a "reload for the latest version" banner should be gated on. Page-wide, so two library copies that are themselves partitioned still see the same answer — skew is a property of the origin, not of one bundle's view of it. Cumulative, so a stale tab closing does not un-report the deploy that produced it.
- Development gets a warning naming the bus, both versions, and which direction the other build is.
- **`WIRE_VERSION`** is exported for logging and assertions.

Recognising a skewed peer is deliberately strict — full envelope shape, numeric `v`, string `scope`/`type`/`clientId`. A bus name is only a `BroadcastChannel` name, and reporting an unrelated script on the origin as a stale deploy would make the signal worthless.

Also fixes the store's wire dispatch, which ended in a bare `else`: every `state` wire that was not a `hello` or a `patch` was read as a snapshot. Adding any new `state` type in a later minor would therefore have arrived at every older tab as a malformed snapshot, and the only reason that was harmless today is that the versions-map check happened to reject it. Unknown types are now ignored explicitly, which is what makes additive evolution within a protocol version safe by design rather than by luck.

The contract both halves come from — what may be added within a version, what must bump it — is documented at `packages/core/src/wire.ts` and in the new **Version skew & the wire contract** docs page.

Three size budgets move up by ~150-200 B: `createSharedStore`, `createChannel` and `createPresence`, the entries that carry the bus and therefore the skew check. Most of that is the development warning string, which survives into production bundles until dev-only stripping lands — the warning was rewritten terse with the explanation behind a link for exactly that reason, and this is what it costs after that.
