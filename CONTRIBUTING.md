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

```bash
pnpm install
pnpm build          # build all workspaces (libraries first)
pnpm test           # vitest with coverage — 95% per-file thresholds
pnpm typecheck
pnpm lint
pnpm format:check
pnpm dev            # demo app at http://localhost:5173
pnpm docs           # docs site dev server
```

### Package-scoped commands

```bash
pnpm --filter @use-everywhere/core test
pnpm --filter use-everywhere test
```

## Quality Gates

The husky pre-commit hook runs `lint`, `typecheck`, `format:check`, and `test`.
Coverage thresholds (95% statements/branches/functions/lines, enforced per
file) are part of the test run — new code needs tests, and CI runs the same
gates on Node 22 and 24.

## Branching & Releases

- **`main` always represents the latest published npm version.** Nothing lands
  on `main` except merges from `development` and the release commits/tags the
  automation creates.
- **`development`** is the integration branch: branch off it, PR back into it.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  (enforced by commitlint on commit).

### How a release happens

1. Every user-facing change merged into `development` includes a
   [changeset](https://github.com/changesets/changesets): run `pnpm changeset`
   and pick the bump (`patch` / `minor` / `major`) per affected package, with a
   short summary. Internal-only changes (CI, docs, tests) need no changeset.
2. When `development` is merged into `main`, the Release workflow
   (`.github/workflows/release.yml`) applies all pending changesets: bumps
   versions, writes changelogs, builds, publishes `use-everywhere` and
   `@use-everywhere/core` to npm **with provenance**, tags, creates GitHub
   releases, and pushes the version commit back to `main`.
3. Merge `main` back into `development` afterwards so the bumped versions flow
   downstream.

If the merge contains no changesets, the workflow is a no-op — nothing is
published and versions stay put.

## Pull Requests

- Target `development` (never `main` directly).
- Keep PRs focused; explain the why, not just the what.
- Include a changeset (`pnpm changeset`) for anything user-facing.
- Update guides in `apps/docs/docs` when behavior changes; the API reference
  regenerates itself from source.
