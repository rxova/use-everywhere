---
sidebar_position: 3
---

# The version clock

Every conflict in this library is settled by one exported function. It's four
lines long, and it's worth understanding, because it explains why writes
converge, why a restored value can beat a live tab, and how leader elections
resolve.

```ts
import { newer, type Version } from 'use-everywhere';

type Version = readonly [counter: number, clientId: string];

newer(a: Version, b: Version | undefined): boolean;
```

`newer(a, b)` answers: **should `a` overwrite `b`?**

- No `b` at all → yes, anything beats nothing.
- Higher counter → yes.
- Same counter → the **larger `clientId` string wins**.

That last rule is the important one. It's arbitrary, and that's the point: two
tabs writing at the same logical moment need to pick the same winner _without
talking to each other_. Comparing ids does it, deterministically, everywhere, at
once. Nobody has to concede — they just independently arrive at the same answer.

## Where it gets used

**Shared state.** Every key carries its own `Version`. A write bumps the
counter and stamps your id; an incoming patch is applied only if `newer()` says
so. Two tabs writing the same key converge on one value; two tabs writing
_different_ keys never conflict at all.

**Persistence.** The clocks go to disk with the values, so a restored value
re-enters the race with its real term. A stored `[3, 'old-tab']` beats a live
tab still sitting at `[1, 'x']`, and loses to one at `[5, 'y']`. Either way both
end up agreeing. Store a bare value with no clock — the naive approach — and it
comes back at counter zero and can never win, even when it genuinely is the
newest thing anyone has.

**Leader election.** A leader's _term_ is a `Version`. Claims are arbitrated
with the same `newer()`, so when two tabs claim at once, the tie-break by
`clientId` picks a winner and the loser concedes on the next round trip. No
consensus protocol, no coordinator.

## Counter zero is special

A counter of `0` means **"registered, but never written"** — somebody's
`initial`, not data.

Because every real write starts at `1`, a `[0, *]` version loses to everything.
That single invariant does a lot of work:

- A hook's `initial` can never clobber a value another tab already has.
- Nothing at counter zero is ever persisted — there's nothing to save.
- A restored value always outranks any `initial`, so it survives to first paint
  with no flash.

## Using it yourself

You'd reach for it if you're merging your own versioned data — say, reconciling
what came off the bus against what came from your server:

```ts
import { newer } from 'use-everywhere';

if (newer(incoming.version, local.version)) {
  local = incoming;
}
```

It's a pure function with no dependencies, and it costs nothing to import.

For the whole picture — the hello/snapshot handshake, why late joiners hydrate
instantly — see [How sync works](../under-the-hood/how-sync-works.md).
