---
title: 'Version skew & the wire contract'
sidebar:
  order: 3
---

Every deploy puts two versions of your app on one origin at once. The tab a user
opened this morning is running last week's bundle; the one they opened after
lunch is running today's. Both are on the same origin, both are on the same bus,
and neither knows the other exists until they start talking.

This page is the contract that makes that safe.

## The two rules

Everything that crosses the bus carries a protocol version, `v`. What that
number does is answer one question — _can this build read this wire?_ — and the
whole contract follows from the two ways of answering it.

**Across versions, partition — loudly.** A wire whose `v` doesn't match is
dropped, because the only thing a build knows about another protocol version is
that it doesn't know it. Guessing would mean applying a value it may be reading
wrong, and a corrupted replica is worse than an absent one.

**Within a version, evolve additively.** A new message type on an existing scope
doesn't bump `v`, on one condition: every engine dispatches on the types it
knows and ignores the rest. That's what lets a feature ship without cutting the
origin in half on deploy day.

## Why the drop is loud

Dropping alone would be the silent degradation this library exists to avoid —
your app would work, your writes would appear to succeed, and half the origin
would never hear them. So a foreign version is also recorded, and warned about
once in development:

```
[use-everywhere] a peer on bus "app" is speaking wire protocol v2, but this
build speaks v1. That is a newer build of use-everywhere running in another
tab, window, or worker on this origin — normal during a rolling deploy. …
```

In production, ask directly:

```ts
import { getWireSkew, WIRE_VERSION } from '@use-everywhere/core';

if (getWireSkew('app').length > 0) {
  showBanner('A new version is available. Reload to keep your tabs in sync.');
}
```

`getWireSkew(name)` returns the foreign protocol versions heard on that bus,
ascending. Empty is the normal case and the one a finished deploy returns to.

It's a query, not a subscription, because skew is observed as a side effect of
receiving a wire — there's no event of its own. Poll it where you'd render the
banner, or check it when a user is about to do something you'd rather they
didn't do half-partitioned.

Two properties worth knowing:

- **Page-wide.** If two copies of the library are loaded on one page and are
  themselves partitioned from each other, both still see the same ledger. Skew
  is a fact about the origin, not about one bundle's view of it.
- **Cumulative.** It never un-reports a version. A stale tab that closes leaves
  its mark, because the deploy that produced it happened — a banner gated on
  this shouldn't flicker off because someone closed a window.

## What skew actually costs

A partition is not a failure. Each generation goes on working normally with its
own:

|                  | Same version          | Skewed                  |
| ---------------- | --------------------- | ----------------------- |
| Shared state     | converges             | separate replicas       |
| Presence         | counted as a peer     | invisible to each other |
| Leader seat      | one seat between them | one seat **each**       |
| Channel messages | delivered             | dropped                 |

The leader row is the one to plan for. Two generations mean two seats, so
singleton work — a poll, a websocket, a scheduled sync — runs once per
generation for the length of the deploy. That's usually fine and occasionally
isn't; if it isn't, gate the work on `getWireSkew()` being empty, or make it
idempotent.

## For contributors: when to bump `v`

Bumping is not a failure. It's the honest signal, and it's cheap precisely
because the generations partition cleanly instead of corrupting each other.

Bump it for anything that breaks the additive rule:

- a field whose **meaning** changes, rather than one that's added
- a message type that stops being sent, where a peer waits for it
- a value that stops being comparable the way the clock expects

Don't bump for:

- a new `type` on an existing `scope` — old builds ignore it
- a new **optional** field on an existing type — but readers must tolerate its
  absence, because half the origin was built before it existed

The rule that makes the first list safe is that no engine's dispatch may end in
a bare `else`. An unknown type has to fall through to nothing. A dispatch that
treats "everything else" as one known shape turns every future addition into a
malformed version of that shape, which is forward compatibility by luck rather
than by design.

`WIRE_VERSION` is exported if you need to log or assert on it. The full contract
lives in `packages/core/src/wire.ts`.

## Related

- [How sync works](/under-the-hood/how-sync-works/) — what's on the wire in the
  first place
- [Limitations & FAQ](/under-the-hood/limitations/) — the other things this
  library declines to hide from you
