# Mutation testing

```bash
pnpm run mutation
```

Roughly seven minutes. Reports at `reports/mutation/mutation.html` (browsable)
and `mutation.json` (what the gate reads).

**CI runs it on a schedule, not per PR** (`.github/workflows/mutation.yml` —
Sunday, Wednesday and Friday at 03:17 UTC, plus `workflow_dispatch` for an
on-demand run). At roughly eight minutes it was longer than every other job
combined and set the wall-clock for every pull request, while catching something
perhaps once a month.

The trade is worth stating plainly: a regression can now land on `main` and go
unnoticed for up to three days. That is acceptable because what this measures —
test _quality_ — drifts slowly, and because the per-file coverage thresholds
still gate every PR. Mutation testing catches tests that pass without asserting;
coverage catches tests that are missing.

Run it yourself before merging anything that reworks a core module. The HTML
report is uploaded as an artifact on every scheduled run.

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
| `leader-web-locks.ts` | 93.33     | 8         |
| `bus.ts`              | 92.41     | 12        |
| `shared-store.ts`     | 92.26     | 23        |
| `schema.ts`           | 92.16     | 4         |
| `serializer.ts`       | 91.84     | 3         |
| `presence.ts`         | 90.74     | 8         |
| `wire.ts`             | 90.41     | 7         |
| `leader.ts`           | 90.00     | 16        |
| `shared-reducer.ts`   | 90.00     | 12        |
| **total**             | **91.84** | **98**    |

Started at 84.63 with 195 survivors. `leader.ts` and `shared-reducer.ts` sit
exactly on 90, so they are the two to watch: the next change to either is the one
that drops below.

Two modules have already been below and come back. `leader-web-locks.ts` (88.33)
and `shared-store.ts` (89.90) both failed the gate the run after 0.11.0 landed —
new branches in `joinQueue` and in the store's `close`, each with a test that ran
them and asserted something that could not fail. Findings 6 and 7 below are those
two. Worth knowing what the shape of this failure looks like: the overall score
stayed above the break threshold both times, and only the per-module check
noticed.

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

**6. An ineligible tab was checked for the wrong thing.** Two tests asserted
that a tab created with `eligible: false` does not _hold_ the lock — which is
also true of a tab that asks for it, is granted it, and declines inside the
callback. Six mutants of the `joinQueue` guard survived on that gap, including
deleting the guard outright. The distinction is not academic: asking takes a
place in the queue ahead of tabs that want the seat, and holds it for a turn.
The test now watches `locks.request` itself.

**7. The live-store count could not be observed going down.** `devWarn`
deduplicates per message, and the duplicate-store message is fixed by the store
name — so the old test's closing move (close both, open a third, expect
silence) could not fail: the third store's warning was suppressed as a repeat
whatever the count said. Every mutant of the decrement survived it, including
`- 1` becoming `+ 1`. The bookkeeping is now checked on a name that has not
warned yet, where silence is a real assertion, and a store on a custom
transport — never counted on the way in — is checked not to discount on the way
out.

## Mutants deliberately left alive

Two categories, marked in the source with `// Stryker disable next-line` and a
reason rather than left as unexplained survivors:

- **Environment detection.** `typeof document !== 'undefined' && typeof
addEventListener === 'function'` is true in every browser-like test environment
  and false in every Node one, so no mutant of it is distinguishable by anything
  we run.
- **Message text.** Warning and error prose is not asserted on. Pinning it makes
  every reworded warning a failing test, which is a real cost for no real
  safety. The `UE` code is the exception, and is asserted: it is the part that
  is promised to be permanent, and the part somebody pastes into a search box.

## Triaging the rest

Of the 195 survivors, **44 are `StringLiteral`** mutations, most of them inside
warning and error messages. Those are deliberately not asserted: pinning message
text makes every reworded warning a failing test, which trades a real cost for no
real safety. They are left alive on purpose.

The **84 `ConditionalExpression`** survivors are where the value is. Work them by
module, highest-stakes first, and prefer writing the test the mutant asks for
over deleting the branch — a branch nothing tests is either a missing test or
dead code, and the mutant does not know which.
