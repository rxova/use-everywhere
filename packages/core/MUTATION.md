# Mutation testing

```bash
pnpm --filter @use-everywhere/core run mutation
```

Roughly nine minutes. Report at `reports/mutation/mutation.html`.

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

`break` is set to the **measured baseline**, not the target. The roadmap wants
≥90 on core state modules; the score was **84.63** when this landed. Raise
`break` as survivors are killed, so the number can only go up.

Setting it to the goal on day one would mean a permanently red job, and a red job
nobody can fix is a job everybody learns to ignore.

## Baseline, at the commit that added this

| Module                | Score     | Survivors |
| --------------------- | --------- | --------- |
| `clock.ts`            | 97.14     | 1         |
| `channel.ts`          | 94.03     | 4         |
| `schema.ts`           | 94.00     | 3         |
| `wire.ts`             | 88.89     | 8         |
| `leader.ts`           | 86.39     | 23        |
| `serializer.ts`       | 85.71     | 6         |
| `shared-store.ts`     | 84.57     | 50        |
| `presence.ts`         | 83.33     | 16        |
| `shared-reducer.ts`   | 83.33     | 20        |
| `leader-web-locks.ts` | 78.29     | 28        |
| `bus.ts`              | 78.18     | 36        |
| **total**             | **84.63** | **195**   |

## What the first run found

Two tests that passed for the wrong reason. Both were **fixed in the same commit
that added this file**, and both now fail when the mutant is applied by hand —
which is the only way to be sure a test kills something.

**1. The snapshot suppression rule was untested.** `if (coveredBy(versions))
cancelSnapshot()` survived being replaced with an unconditional
`cancelSnapshot()` — the exact bug the surrounding code was written to fix. The
test meant to cover it built a "partial" peer that had already hydrated from the
first snapshot, so it was not missing anything, and the assertion held either
way. It now keeps the peer genuinely partial with `accept: () => false`, and
forces the ordering with per-peer `snapshotDelayMs` instead of hoping the race
lands the right way round.

**2. Leader handover in the reducer was untested.** `Math.max(lastIssued, seq)`
survived being replaced with `Math.min`. A tab that has just inherited the seat
has issued nothing, so `lastIssued` is 0 while `seq` reflects everything it has
observed — with `min`, it renumbers from 1 and reissues commit numbers every peer
has already applied, which are then silently dropped as duplicates. The code
comment described this case exactly; no test exercised it.

## Triaging the rest

Of the 195 survivors, **44 are `StringLiteral`** mutations, most of them inside
warning and error messages. Those are deliberately not asserted: pinning message
text makes every reworded warning a failing test, which trades a real cost for no
real safety. They are left alive on purpose.

The **84 `ConditionalExpression`** survivors are where the value is. Work them by
module, highest-stakes first, and prefer writing the test the mutant asks for
over deleting the branch — a branch nothing tests is either a missing test or
dead code, and the mutant does not know which.
