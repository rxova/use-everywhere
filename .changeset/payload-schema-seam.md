---
'@use-everywhere/core': minor
---

Validate payloads against a schema instead of casting them and hoping.

Everything else here is checked before it is trusted — the envelope, the version clock, the origin on a window channel. The payload was the exception: `wire.payload` was cast to the receiving code's type, so what a handler believed it had was whatever the _sender's_ build thought the shape was. A rolling deploy turns that from a technicality into a bug.

`createChannel` and `createSharedStore` now take a **`schema`** map — per message type, per store key — of anything implementing [Standard Schema](https://standardschema.dev). That is Zod, Valibot, ArkType and anything else exposing `~standard`, without this library depending on any of them: the spec is a shape, not a package. Keys with no entry are not validated, so the seam is adoptable one message at a time.

Failure differs by direction, on purpose:

- **Inbound the payload is dropped** — the same choice the envelope makes for a wire it cannot read. The handler is not called and the channel keeps working; one bad payload does not cut a peer off.
- **Outbound `post()` and `set()` throw** — a value this tab just built and cannot describe is a bug here, and finding it here beats every peer finding it instead. Same all-or-nothing guarantee as the structured-clone pre-check.

**`onInvalid`** observes failures instead of the default development warning — it replaces the warning, not the outcome.

Two things worth knowing:

- In a store, validation sits **after** the last-writer-wins comparison, so a value that was going to lose anyway is neither validated nor reported as broken. It covers the restore from disk as well as the wire, which is the case that matters most: state written by last month's deploy outlives every tab that knew what it meant and restores with a winning clock.
- **Schemas must be synchronous.** Delivery on this bus is synchronous and documented as such, so a validator that answers later cannot gate a delivery that happens now — the alternatives are buffering every message behind a microtask or letting unvalidated values through while the schema thinks. An async validator is refused with an error naming the vendor rather than quietly awaited. Every synchronous Zod/Valibot/ArkType schema is unaffected.

New **Validating payloads** guide covers the whole seam.

Two size budgets move up by ~300 B: `createSharedStore` and `createChannel`, the two engines that gained the gate. That is paid by every caller, including the ones who never declare a schema — the strings are the bulk of it, and they were written terse with the explanation behind a link for exactly that reason.
