# Mutation testing

```bash
pnpm run mutation
```

Roughly seven minutes. Reports at `reports/mutation/mutation.html` (browsable)
and `mutation.json` (what the gate reads).

**CI runs it nightly, not per PR** (`.github/workflows/mutation.yml`, 03:17 UTC,
plus `workflow_dispatch` for an on-demand run). At roughly eight minutes it was
longer than every other job combined and set the wall-clock for every pull
request, while catching something perhaps once a month.

The trade is worth stating plainly: a regression can now land on `main` and go
unnoticed until the next night. That is acceptable because what this measures —
test _quality_ — drifts slowly, and because the per-file coverage thresholds
still gate every PR. Mutation testing catches tests that pass without asserting;
coverage catches tests that are missing.

Run it yourself before merging anything that reworks a core module. The HTML
report is uploaded as an artifact on every nightly run.

## Why

Coverage proves a line **ran**. It cannot prove anything **checked what it did** —
a test that calls `store.set()` and asserts nothing gives 100% coverage and zero
confidence. Mutation testing breaks the source deliberately and asks whether any
test notices.

This library's worst failure mode is silent divergence: two replicas that
disagree without erroring. That is precisely the class of bug a passing-but-empty
test hides, which is why the roadmap puts mutation testing on the road to 1.0.

## Scope

The `mutate` list is the modules where a surviving mutant means silent
divergence rather than a visible bug — the clock, the store, the bus, leadership,
the reducer, the wire contract. Not the whole package: triage is the real cost of
mutation testing, and a surviving mutant inside a development warning is nobody's
best afternoon.

## The threshold is a ratchet

Two gates, because they catch different things.

Stryker's own `thresholds.break` is **90**, and it applies to the **overall**
score — which a large well-tested file can hold up while a small one rots
underneath it. So `packages/tooling/check-mutation.ts` runs straight afterwards
and fails **any single module** below the same floor. That is the shape the
roadmap actually asks for, and the reason a 100-mutant file at 100% cannot
paper over a 10-mutant file at 50%.

Mutants marked `Ignored` — silenced by a `// Stryker disable` comment — are left
out of both. Counting them would punish the annotation that records a considered
decision.

Raise the floor as survivors die. Never lower it.

## Where it stands

| Module                | Score     | Survivors |
| --------------------- | --------- | --------- |
| `clock.ts`            | 97.14     | 1         |
| `channel.ts`          | 94.03     | 4         |
| `schema.ts`           | 94.00     | 3         |
| `bus.ts`              | 93.59     | 10        |
| `serializer.ts`       | 91.84     | 3         |
| `wire.ts`             | 91.67     | 6         |
| `leader-web-locks.ts` | 90.83     | 11        |
| `presence.ts`         | 90.74     | 8         |
| `shared-store.ts`     | 90.17     | 29        |
| `leader.ts`           | 90.00     | 16        |
| `shared-reducer.ts`   | 90.00     | 12        |
| **total**             | **91.40** | **103**   |

Started at 84.63 with 195 survivors. `leader.ts` and `shared-reducer.ts` sit
exactly on 90, so they are the two to watch: the next change to either is the one
that drops below.

## What the runs found

Four tests that passed for the wrong reason, and one real bug. Each was confirmed
by applying the mutant by hand and watching the test go red — the only way to be
sure a test kills something.

**1. The snapshot suppression rule was untested.** `if (coveredBy(versions))
cancelSnapshot()` survived being replaced with an unconditional
`cancelSnapshot()` — the exact bug the surrounding code was written to fix. The
test built a "partial" peer that had already hydrated from the first snapshot, so
it was missing nothing and the assertion held either way. It now keeps the peer
genuinely partial with `accept: () => false`, and forces the ordering with
per-peer `snapshotDelayMs` instead of hoping the race lands the right way round.

**2. Leader handover in the reducer was untested.** `Math.max(lastIssued, seq)`
survived becoming `Math.min`. A tab that has just inherited the seat has issued
nothing, so `lastIssued` is 0 while `seq` reflects everything it has observed —
with `min`, it renumbers from 1 and reissues commit numbers every peer has
already applied, which are then silently dropped as duplicates. The code comment
described this case exactly; no test exercised it.

**3. A real serializer bug.** `lossyType` only reported `undefined` when _both_
the raw and the serialised value were undefined. An object whose `toJSON()`
returns `undefined` has a defined raw value, so JSON dropped the key and said
nothing — the precise silent-loss class the serializer exists to prevent. Now
checked on the serialised value, with the two cases named differently so a reader
knows which one they hit.

**4. Development warnings were only half-covered in production mode.** The
runtime guard tests exercised four warnings; the bus option conflicts, the
duplicate-store warning, the refused restore and the wire-skew warning were not
among them, so nothing checked that those particular ones stay silent in a
production build.

**5. The Web Locks strategy had no test for who may vacate a seat.** A follower
closing must not announce a resign — that would tell every peer the leader had
gone while it sat there holding the lock.

## Mutants deliberately left alive

Two categories, marked in the source with `// Stryker disable next-line` and a
reason rather than left as unexplained survivors:

- **Environment detection.** `typeof document !== 'undefined' && typeof
addEventListener === 'function'` is true in every browser-like test environment
  and false in every Node one, so no mutant of it is distinguishable by anything
  we run.
- **Message text.** Warning and error strings are not asserted on. Pinning them
  makes every reworded warning a failing test, which is a real cost for no real
  safety.

## Triaging the rest

Of the 195 survivors, **44 are `StringLiteral`** mutations, most of them inside
warning and error messages. Those are deliberately not asserted: pinning message
text makes every reworded warning a failing test, which trades a real cost for no
real safety. They are left alive on purpose.

The **84 `ConditionalExpression`** survivors are where the value is. Work them by
module, highest-stakes first, and prefer writing the test the mutant asks for
over deleting the branch — a branch nothing tests is either a missing test or
dead code, and the mutant does not know which.
