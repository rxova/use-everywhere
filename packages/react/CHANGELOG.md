# use-everywhere

## 0.5.0

### Minor Changes

- [#35](https://github.com/rxova/use-everywhere/pull/35) [`5daf920`](https://github.com/rxova/use-everywhere/commit/5daf9205a9a18a03af588ffb021bc08c13bfecd5) - Inherit the hardened core: bfcache-safe state and leadership, all-or-nothing writes that can no longer diverge a tab from its peers, crypto-grade client ids, idempotent teardown, and the new `onError` option on the persistence adapters (re-exported from `@use-everywhere/core`).

  No React API changed. Client ids are now 64-bit hex rather than six base-36 characters, so anything asserting on their shape — `useClientId`, peer ids from `usePeers` — sees the new format. Size budgets were raised to match the core's added safety machinery.

- [#37](https://github.com/rxova/use-everywhere/pull/37) [`0044801`](https://github.com/rxova/use-everywhere/commit/0044801e6f38f09483215a3c9248032c3b857f00) - Make the hooks safe on a server, and make the API's silent conflicts loud.

  - **SSR is inert.** Every hook called `getStore`/`getPresence`/`getLeader` in the render body, so rendering on a server opened transports, armed presence heartbeats, and ran a _leader election_ on `setInterval`s nothing ever cleared — one leak per name, per process, for the life of a Next.js server. The registry now hands back inert doubles when there is no `window`; the real engines are still built on the client, on first use.
  - **`useClientId` no longer breaks hydration.** It returned a per-environment random id straight from render, so the server's markup could never match the browser's. It now reads through `useSyncExternalStore` with a constant empty-string server snapshot, which React reuses for the hydrating render. Treat `''` as "not known yet"; the real id arrives in the commit immediately after.
  - **`defineStore` survives Fast Refresh.** Re-registering the same configuration used to throw, so every hot edit of the defining module broke dev. An identical redefinition is now a no-op, and only a genuinely different one warns.
  - **`useOpenedWindow` returns a discriminated union.** `status` now narrows `result` and `error` — `status === 'done'` gives `result: R` with no non-null assertion, and `closed-early` types `error` as `WindowClosedError`. `OpenedWindowState` and `OpenedWindowControls` are exported. The hook also no longer writes a ref during render, which is unsafe under concurrent rendering, and status/result/error move as one state object so no render can observe a torn combination.
  - **Dev warnings** for two conflicts that were silent: one key registered with two different initial values (first wins, second discarded), and a second `useLeader`/`getLeader` call asking for election timings that are ignored because the first call fixed them.

  Documented at the API: `useSharedState`'s convergence is last-writer-wins per key, not per operation, so concurrent `set(n => n + 1)` in two tabs loses an increment.

  Size budgets were raised to absorb the server doubles and the diagnostic strings, which production bundles still retain.

### Patch Changes

- Updated dependencies [[`5daf920`](https://github.com/rxova/use-everywhere/commit/5daf9205a9a18a03af588ffb021bc08c13bfecd5), [`0044801`](https://github.com/rxova/use-everywhere/commit/0044801e6f38f09483215a3c9248032c3b857f00)]:
  - @use-everywhere/core@0.5.0

## 0.4.1

### Patch Changes

- [#31](https://github.com/rxova/use-everywhere/pull/31) [`b96b6e9`](https://github.com/rxova/use-everywhere/commit/b96b6e90230fb5363a0c5e732b5db238e06c3391) - Add the project logo as `assets/logo.svg` and show it above the title in the README. Documentation-only: no API, bundle, or runtime change.

- Updated dependencies [[`b96b6e9`](https://github.com/rxova/use-everywhere/commit/b96b6e90230fb5363a0c5e732b5db238e06c3391)]:
  - @use-everywhere/core@0.4.1

## 0.4.0

### Minor Changes

- 833d69a: Mark the React entry points with a `'use client'` banner so the hooks import directly into a Next.js App Router / React Server Components tree without the library tripping a "Server Component" error — you still call them from your own Client Component, but never see the error from inside the package. Adds a Next.js quickstart to the docs.

  Also ship a CommonJS build alongside ESM (`require('use-everywhere')` now works, including the `use-everywhere/devtools` subpath), with per-condition types and an are-the-types-wrong-clean `exports` map.

### Patch Changes

- Updated dependencies [833d69a]
  - @use-everywhere/core@0.4.0

## 0.3.0

### Minor Changes

- 1ce8824: Add useLeader, useIsLeader, and useLeaderEffect. useLeaderEffect runs an effect only in the elected tab and tears it down when the seat moves — the fix for N tabs opening N WebSockets. Eligibility is a property of the tab (set it in one place), so opting out is dynamic rather than a second election.
- 0bf735a: Add defineStore(name, { persist }): bind a store name and its persistence once at module level and get typed useSharedState back, plus get() for non-React code. It resolves to the same store singleton a bare useSharedState({ store: name }) reaches, so both get persistence. Running it after that store already exists throws rather than quietly handing back an unpersisted store.
- 6d4daa3: Add <Inspector /> on the new use-everywhere/devtools subpath: a floating panel showing this tab's peers, the leader, every store key with its version clock, and a live log of wires in both directions. It lives on a separate entry point, so it stays out of your bundle unless you import it, and it never creates a Leader — a devtool that enrolled your tab in an election it never asked to join would change the thing it measures. It reads the crown out of the wire log instead.

### Patch Changes

- ad7f986: Re-export the new core debug helpers (observeBus, enableDebug, getBusNames). DEFAULT_NAME now comes from core; its value and behavior are unchanged.
- 23b8bd3: Internal: the store registry's map key contained a literal NUL byte. It worked, but git classifies any file holding one as binary, so every change to registry.ts rendered as an unreviewable 'Bin ... bytes' diff. No behavior change.
- 5d6f8de: No API change. Adds a Playwright end-to-end suite covering what unit tests cannot: a real BroadcastChannel across real tabs, real pagehide handover, and real localStorage surviving the last tab.
- Updated dependencies [ad7f986]
- Updated dependencies [1ce8824]
- Updated dependencies [0bf735a]
  - @use-everywhere/core@0.3.0
