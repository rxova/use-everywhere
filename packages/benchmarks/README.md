# @use-everywhere/benchmarks

What the library costs over a raw `BroadcastChannel`, measured. Private to the
repository — it publishes numbers, not a package.

```sh
pnpm run bench          # measure and print
pnpm run bench:check    # measure and fail on a budget
```

Every budget is a **ratio against a baseline measured in the same run**, never
an absolute time: a hosted runner is shared, throttled, and a different machine
every time, so an absolute budget produces red builds that mean nothing. A slow
runner slows the baseline too.

- `src/measure.ts` — statistics. Unit-tested, because a benchmark whose
  percentile is wrong produces a number people go on to quote.
- `src/gate.ts` — the verdict, and why each number is what it is.
- `src/budgets.ts` — the budgets themselves.
- `src/suites/` — the benchmarks: store write latency, channel throughput, and
  the late-joiner snapshot storm.

See [the docs page](https://rxova.org/packages/use-everywhere/under-the-hood/benchmarks/)
for the current numbers and what they mean.
