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
underneath it. So `scripts/mutation/check-mutation.ts` runs straight afterwards
and fails **any single module** below the same floor. That is the shape the
roadmap actually asks for, and the reason a 100-mutant file at 100% cannot
paper over a 10-mutant file at 50%.

Mutants marked `Ignored` — silenced by a `// Stryker disable` comment — are left
out of both. Counting them would punish the annotation that records a considered
decision.

Raise the floor as survivors die. Never lower it.

## When the number itself is wrong

A mutation score can collapse for a reason that has nothing to do with the tests,
and this one has. The scheduled run failed eight times between 2026-10-11 and
2026-10-30, reporting an overall **0.72** with 1383 survivors, on a tree whose
tests had not changed.

Nothing had rotted. Renovate took Vitest to 5 and StrykerJS to 10 on the same day
(2026-10-09); the next scheduled run was the first failure.
`@stryker-mutator/vitest-runner` 10.0.0 builds its per-test filter by joining the
suite chain with a plain space, but Vitest 5 matches `testNamePattern` against the
chain joined with `' > '`. Every test in this package lives inside a `describe`,
so the filter matched nothing, every non-static mutant ran **zero** tests, and
Stryker recorded each one as Survived — a false survivor in the most literal
sense: the suite kills it, Vitest was never asked to run it.

Two tells, and the second is the one that names the cause:

- **"Ran _n_ tests per mutant on average"**, from the clear-text reporter. It
  tracks the score almost exactly. At 0.72 it read 0.99; a healthy run reads
  about 10.5. A plausible-looking score with a collapsed tests-per-mutant number
  is a tooling failure, not a regression, and no amount of writing tests will
  move it.
- **Every killed mutant is `static`.** Static mutants re-run the whole suite
  instead of a filtered selection, so they are the only ones that still die when
  the filter is broken. The 0.72 run killed 10 mutants, all 10 static, and
  survived 1383, all non-static. A score where the per-file survivors are
  precisely the non-static mutants is not a statement about the tests.

The fix was `@stryker-mutator/vitest-runner` **10.1.1**, which introduces a
`VITEST_MODERN_TEST_NAME_SEPARATOR` and picks the separator by Vitest version. No
Stryker option works around 10.0.0: both `vitest.related: false` and
`coverageAnalysis: "all"` still give 0.00 tests per mutant, because neither
avoids the name filter.

Worth knowing how it got in: the runner's peer range on Vitest is `>=2.0.0`, open
at the top, so pnpm resolved a pairing the runner did not support without a
warning, and the job reported a number instead of failing. When this job goes red
after a dependency bump, read the tests-per-mutant line before reading the diff.

One thing the repaired run makes visible: StrykerJS 10 mutates more than 9.6 did.
On unchanged source, `channel.ts` went from 67 counted mutants to 89, `bus.ts`
from 152 to 169 and `presence.ts` from 108 to 126 (`clock.ts` is untouched at 35).
The new mutants are not killed, so those three modules now sit under the floor at
85.39, 89.35 and 88.89 against an overall 90.48. Nothing rotted and no test got
worse — the measurement got stricter, and the table below still reflects the 9.6
mutant set.

## Where it stands

| Module                | Score     | Survivors |
| --------------------- | --------- | --------- |
| `clock.ts`            | 97.14     | 1         |
| `leader.ts`           | 95.00     | 8         |
| `wire.ts`             | 94.29     | 4         |
| `shared-reducer.ts`   | 94.17     | 7         |
| `channel.ts`          | 94.03     | 4         |
| `leader-web-locks.ts` | 93.33     | 8         |
| `bus.ts`              | 92.11     | 12        |
| `shared-store.ts`     | 92.10     | 23        |
| `serializer.ts`       | 91.84     | 4         |
| `schema.ts`           | 91.67     | 4         |
| `presence.ts`         | 90.74     | 10        |
| **total**             | **93.03** | **85**    |

Started at 84.63 with 195 survivors. `presence.ts` is now the closest to the floor.

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

**8. Three modules fell below the floor after `createDevWarner` (2026-09-30).**
`wire.ts` (87.67), `schema.ts` (88.24) and `bus.ts` (89.87) failed the first run
after `devWarn` moved to `@rxova/ts-utils`. Three separate causes:

- The `process.env.NODE_ENV !== "production"` guard around each warning became
  an equivalent mutant. The old `devWarn` read `NODE_ENV` once at import, so
  the runtime guard tests could only pass through the outer guard. The new warner
  checks on every call, so forcing or blanking the guard changes nothing a test
  can see. The guard is still needed: it is what lets a bundler strip the string
  (`dev-stripping.test.ts`). Its `ConditionalExpression` and `StringLiteral`
  mutants are now disabled with that reason; `===` stays mutated and is killed.
- The wire-skew warning test for the older direction named its bus
  `skew-older`. The bus name is in the message, so `toContain("older")` passed
  whichever direction the message gave. The bus is now `skew-past`, and the
  `UE1007` code is asserted.
- `coveredBy` surviving `every` → `some` was down to chance. Whether the
  partial peer in finding 1 covered the informed peer on `a` came from the
  tie-break between two random client ids. A second test makes the partial peer
  strictly newer on `a` and missing `b`, so standing down would lose `b`.

**9. `leader.ts` and `shared-reducer.ts` sat exactly on the floor.** Each had
survivors that were real, untested behaviour, and two existing tests looked
like they covered them but could not fail:

- The "setEligible is a no-op" test called it while already leading, where
  skipping the no-op check changes nothing. Called before the first beat, a
  broken check claims the seat without waiting for an incumbent to answer.
- The "non-leader traffic" test sent a presence `ping`, which is dropped
  before the scope check. A presence `hello` is what reaches it.
- New cases pin that a no-op leader change notifies nobody,
  `waitForLeadership` stays pending while another tab leads, only the leader
  answers a `hello`, only the leader's heartbeat holds the lease, a follower
  made eligible does not take a held seat, and only a bfcache `pageshow`
  re-announces.
- For the reducer: a snapshot at the current commit number is ignored,
  numbering carries on correctly after a snapshot replays a buffered commit,
  the reducer builds its leader on its own transport with its
  `leaderOptions`, and closing it hands the seat to a survivor.

The rest are equivalent: a second `close()` is absorbed by the bus's own
`released` guard, buffered commits at or below a snapshot are never read
again, and an empty `strategy` falls through to the heartbeat election just
as `auto` does without Web Locks.

## Mutants deliberately left alive

Three categories, marked in the source with `// Stryker disable next-line` and a
reason rather than left as unexplained survivors:

- **Environment detection.** `typeof document !== 'undefined' && typeof
addEventListener === 'function'` is true in every browser-like test environment
  and false in every Node one, so no mutant of it is distinguishable by anything
  we run.
- **Development-warning guards.** `process.env.NODE_ENV !== "production"` around
  a `devWarn` call is for the bundler, which strips the warning when it folds the
  guard. At runtime `devWarn` makes the same check itself, so forcing or blanking
  the guard's condition is not observable. Only `ConditionalExpression` and
  `StringLiteral` are disabled; `===` is still mutated and still killed.
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
