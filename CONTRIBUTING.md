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

- Node.js `>= 20` (see `.nvmrc` for the recommended version)
- pnpm (see `packageManager` in `package.json`)

### Install & common commands

```bash
pnpm install
pnpm build          # build all workspaces (libraries first)
pnpm test           # vitest with coverage — 90% per-file thresholds
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
Coverage thresholds (90% statements/branches/functions/lines, enforced per
file) are part of the test run — new code needs tests, and CI runs the same
gates on Node 20/22/24.

## Pull Requests

- Keep PRs focused; explain the why, not just the what.
- Update guides in `apps/docs/docs` when behavior changes; the API reference
  regenerates itself from source.
