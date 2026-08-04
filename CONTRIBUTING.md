# Contributing

## Architecture Overview

use-everywhere is a small pnpm monorepo:

- `packages/core`: framework-agnostic engine — transports, shared-state store
  (LWW version clocks + late-joiner handshake), typed pub/sub channels,
  presence, and the cross-origin opener/child window channel.
- `packages/react`: React hooks (`useSharedState`, `useMessage`, `usePeers`,
  `useOpenedWindow`, …) layered on core; re-exports the full core surface.
- `apps/demo`: Vite playground, including the cross-origin payment flow.
- `apps/docs`: Docusaurus site; the API reference is generated from source by
  TypeDoc on every build.

Start in `packages/core` for engine/protocol behavior and `packages/react` for
hook APIs. One class per file; types live in sibling `*.types.ts` files.

## Development Workflow

### Requirements

- Node.js `>= 22.13` (pnpm 11 requires it; see `.nvmrc` for the recommended version)
- pnpm (see `packageManager` in `package.json`)

### Install & common commands

Tasks run through [Turborepo](https://turborepo.dev), so `build` happens before
anything that reads `dist` without you asking, and unchanged tasks replay from
cache instead of re-running.

```bash
pnpm install
pnpm verify         # the full gate — the same list CI runs (see below)
pnpm build          # libraries first; dependents wait on them automatically
pnpm test           # vitest with coverage — 95% per-file thresholds
pnpm typecheck
pnpm lint
pnpm format:check
pnpm e2e            # real-tab Playwright suite (builds the libraries first)
pnpm dev            # demo app at http://localhost:5173
pnpm docs           # docs site dev server
```

### Package-scoped commands

```bash
pnpm exec turbo run test --filter=@use-everywhere/core
pnpm exec turbo run test --filter=use-everywhere
```

## Quality Gates

Two hooks, deliberately split so the slow one runs least often:

- **pre-commit** — `lint-staged`: eslint and prettier over the staged files only.
- **pre-push** — `pnpm verify`: audit, dependency dedupe, formatting, lint, then
  build + typecheck + test + size budgets in one Turbo invocation. The ordered
  list lives in [`scripts/verify.mjs`](./scripts/verify.mjs) and is the same list
  CI runs, so a green push means a green pipeline. Turbo caches what did not
  change, so a repeat run is seconds.

Coverage thresholds (95% statements/branches/functions/lines, enforced per file)
are part of the test run — new code needs tests, and CI runs the same gates on
Node 22 and 24.

The e2e suite is not in `verify`: it drives a real browser and runs as its own CI
job. Run it yourself with `pnpm e2e` when you touch anything cross-tab.

### Development warnings must be guarded

Every `devWarn` call site carries the guard literally:

```ts
if (process.env.NODE_ENV !== 'production') {
  devWarn(`[use-everywhere] …`);
}
```

`devWarn` already checks `NODE_ENV` at runtime, so the guard is not about
whether the warning _fires_ — it is about whether the message _ships_. The
string is built at the call site, so without the branch to fold, it lands in
every user's bundle. Four consecutive features paid for that before anyone
noticed, and it quietly turned every new warning into an argument for a terser
warning.

Write it out rather than reaching for a shared `isDev` constant: a bundler can
only fold what it can see, and a constant imported from another module is not
reliably propagated.

`dev-stripping.test.ts` bundles the real entry point as production and fails
naming any warning that survives, so a missed guard is caught rather than
shipped. A thrown `Error` is not a development warning and needs no guard —
stripping one would turn an actionable failure into an anonymous one.

## Branching & Releases

- **`main` is the only long-lived branch**, and it always represents the latest
  published npm version. Branch off it, PR back into it.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  (enforced by commitlint on commit). Keep GitHub's skip-CI markers out of them —
  the string is matched anywhere in the message, so quoting it in a commit body
  silently skips every workflow for that push.

### How a release happens

1. Every user-facing change includes a
   [changeset](https://github.com/changesets/changesets): run `pnpm changeset`
   and pick the bump (`patch` / `minor` / `major`) per affected package, with a
   short summary. Internal-only changes (CI, docs, tests) need no changeset —
   label the PR `skip-changeset` and the gate stands down.
2. Merging the PR into `main` runs CI on the merge commit. **Once CI passes**,
   the Release workflow (`.github/workflows/release.yml`) applies all pending
   changesets: bumps versions, writes changelogs, builds, publishes
   `use-everywhere` and `@use-everywhere/core` to npm **with provenance**, tags,
   creates GitHub releases, and pushes the version commit back to `main`.

The release is gated on that CI run rather than firing on the push itself, so a
merge that turns out red cannot reach npm — where publishes are immutable. If CI
fails, nothing publishes; fix forward and the next green run releases.

If the merge contains no changesets, the workflow is a no-op — nothing is
published and versions stay put.

## Pull Requests

- Target `main`.
- Keep PRs focused; explain the why, not just the what.
- Include a changeset (`pnpm changeset`) for anything user-facing.
- Update guides in `apps/docs/docs` when behavior changes; the API reference
  regenerates itself from source.
