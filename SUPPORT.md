# Support

- **Bug?** Open a [bug report](https://github.com/rxova/use-everywhere/issues/new?template=bug_report.yml).
- **Idea or missing primitive?** Open a
  [feature request](https://github.com/rxova/use-everywhere/issues/new?template=feature_request.yml).
- **Security issue?** Follow [SECURITY.md](./SECURITY.md) — please do not open a public issue.
- **Something private?** Email [rxova@proton.me](mailto:rxova@proton.me).

Before filing, check whether the behaviour is already documented. Two pages answer most of what
gets reported:

- [Limitations & FAQ](https://rxova.org/packages/use-everywhere/under-the-hood/limitations/) —
  the boundaries that are deliberate, including why leader election is advisory rather than a lock.
- [Error codes](https://rxova.org/packages/use-everywhere/errors/) — every diagnostic the library
  prints carries a code, and each code has an entry explaining what triggered it.

## Filing a good bug

Cross-tab bugs are the kind that reproduce on one machine and nowhere else, so the details that
usually matter are:

- The exact package and version (`use-everywhere`, `@use-everywhere/core`, or the ESLint plugin).
- **How many contexts, and of what kind** — two tabs, a tab and a worker, a cross-origin window.
- Which primitive is involved: shared state, a channel, presence, leadership, or a window channel.
- Browser and version. The three engines differ most around `BroadcastChannel` in workers and
  around window lifetime, which is why the e2e suite runs all three.
- Whether it survives a hard reload of every context — a value that outlives one tab but not all
  of them is usually persistence, not sync.

A reproduction built on [`@use-everywhere/test-utils`](https://rxova.org/packages/use-everywhere/guides/testing/)
is the most useful form: `createScenario` drives several simulated tabs in one process, so a
failing case travels as a test rather than as instructions.

## Version support

From 1.0, a breaking public-API change is a major version, arrives with a deprecation period first,
and ships with migration guidance — see [Migrating to 1.0](https://rxova.org/packages/use-everywhere/guides/migration/)
for the one that came with 1.0 itself. Fixes target the latest minor; older minors are not maintained
in parallel.

What the library promises not to break, and what it reserves the right to change, is written down
in the [stability policy](https://rxova.org/packages/use-everywhere/under-the-hood/stability/).
