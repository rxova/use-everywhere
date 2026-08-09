---
title: 'Validating payloads'
description: "Validate what arrives on the bus: the sender may be running last week's bundle, so types alone do not protect you."
sidebar:
  order: 7
---

Types describe what a payload _should_ be. On a bus, they describe what the
sender's build thought it should be — and the sender may be running last week's
deploy.

Everything else in this library is checked before it is trusted: the envelope,
the version clock, the origin on a window channel. The payload is the one thing
that was cast rather than checked. This closes that.

```ts
import { z } from 'zod';
import { defineChannel } from 'use-everywhere';

const cart = defineChannel<{ 'item:add': { sku: string; qty: number } }>('cart', {
  schema: {
    'item:add': z.object({ sku: z.string(), qty: z.number().int().positive() }),
  },
});
```

That's it. A payload that doesn't match never reaches your handler.

## Any schema library, no dependency

The `schema` option takes anything implementing
[Standard Schema](https://standardschema.dev) — Zod, Valibot, ArkType, and a
growing list. That's an interface, not a package, so this library depends on
none of them and takes no position on which you use. A hand-written validator
works too:

```ts
const isSku = {
  '~standard': {
    version: 1,
    vendor: 'my-app',
    validate: (value: unknown) =>
      typeof value === 'string' ? { value } : { issues: [{ message: 'expected a string' }] },
  },
};
```

Keys with no entry are not validated, so you can adopt this one message at a
time.

## What failure does

Validation runs in **both** directions, and they fail differently on purpose.

**Inbound, the payload is dropped.** Same choice the envelope makes for a wire
it can't read: a value you can't trust is one you don't use. Your handler is
never called, and the rest of the channel keeps working — a peer that sends one
bad payload is not cut off.

**Outbound, `post()` throws.** A value your own code just built and can't
describe is a bug _in this tab_, and finding it here beats every peer finding it
instead. This mirrors the structured-clone pre-check on `store.set()`: refuse
the write at its source, all-or-nothing.

By default a failure warns once in development. Pass `onInvalid` to observe it
instead — count it, sample it, ship it to your error tracker:

```ts
defineChannel<Messages>('cart', {
  schema: { 'item:add': itemAdd },
  onInvalid: ({ key, direction, issues }) => {
    telemetry.increment('bus.invalid', { key, direction });
  },
});
```

`onInvalid` replaces the warning; it doesn't change the outcome. Inbound still
drops, outbound still throws.

## Stores take schemas too

Per key rather than per message type, and covering one more entry point:

```ts
const store = createSharedStore(
  'prefs',
  { theme: 'light', fontSize: 14 },
  { schema: { fontSize: z.number().int().min(8).max(32) } },
);
```

Inbound validation sits after the last-writer-wins comparison and before the
write, so a value that was going to lose anyway is never validated — and never
reported as broken.

It also guards **what comes back from disk**. Persisted state is the version-skew
problem with a longer fuse: a value written by last month's deploy outlives every
tab that knew what it meant, and restores with a winning clock. A schema is
currently the way to stop that. (Dedicated `version`/`migrate` hooks are M4, and
will ride this same seam.)

## Schemas must be synchronous

This is the one real constraint, and it's worth understanding rather than
working around.

Delivery on this bus is synchronous — two micro-frontends on one page see a
write in the same task, and that's a documented guarantee. A validator that
answers _later_ can't gate a delivery that happens _now_, without either
buffering every message behind a microtask or letting unvalidated values through
while it thinks.

So an async validator is refused with an error naming the vendor, rather than
quietly awaited. Every synchronous schema — which is every Zod, Valibot and
ArkType schema that doesn't use an async refinement — is unaffected. If you need
async checks, do them in your handler, where waiting is safe.

## What this doesn't do

It doesn't make skewed peers interoperate. If another generation of your app is
sending a genuinely different shape, validation tells you cleanly instead of
letting the difference leak into your state — but the two builds still disagree.
See [Version skew & the wire contract](../under-the-hood/version-skew.md) for
what to do about that.

It also isn't a security boundary. Everything on this bus is same-origin, so a
schema protects you from _your own_ deploys and bugs, not from a hostile page.
For the cross-origin case see the
[security model](../under-the-hood/security-model.md).
