# @use-everywhere/core

## 0.6.0

### Minor Changes

- [#38](https://github.com/rxova/use-everywhere/pull/38) [`7e2e2e6`](https://github.com/rxova/use-everywhere/commit/7e2e2e61e19caa2fbc3691c4470f36a92e9684f2) - Move `MemoryHub` and `MemoryTransport` to a `testing` subpath.

  ```diff
  -import { MemoryHub } from '@use-everywhere/core';
  +import { MemoryHub } from '@use-everywhere/core/testing';
  ```

  They are a multi-tab simulation harness, not runtime API. On the package root they were part of the public, semver-bound surface — something 1.0 would have to promise not to break — and sat in every production bundle's module graph. Nothing else moved: `BroadcastChannelTransport`, `NoopTransport`, and `defaultTransport` are real transports and stay on the root.

## 0.5.0

### Minor Changes

- [#35](https://github.com/rxova/use-everywhere/pull/35) [`5daf920`](https://github.com/rxova/use-everywhere/commit/5daf9205a9a18a03af588ffb021bc08c13bfecd5) - Harden the core against the failure modes real tabs hit:

  - **bfcache**: a tab restored from the back/forward cache now re-announces presence, re-runs the store's late-joiner handshake, and rejoins the leader election — previously it held silently stale state and a phantom seat until the next unrelated write.
  - **All-or-nothing writes**: a value that cannot survive structured clone (a function, DOM node, or class instance smuggled into an object) now throws a `TypeError` naming the key _before_ touching local state — previously the local replica updated, the broadcast threw, and the tab silently diverged from every peer.
  - **Crypto-grade ids**: client ids and window-channel nonces now come from Web Crypto (64-bit hex) instead of `Math.random().toString(36).slice(2, 8)`. The clientId is the LWW tie-breaker and the self-echo filter, and the nonce is a security boundary — a collision meant permanent silent divergence or mutual invisibility.
  - **Idempotent `close()`** on every engine, and a shutdown guard on the shared bus: a double-closed channel can no longer shut the bus down underneath a sibling store.
  - **Window channel**: a handshake timeout now tears the message listener down, so a child that connects late cannot revive a channel whose promises already rejected; the child side now validates `event.source` against the opener, mirroring the opener's own defense.
  - **Persistence observability**: `webStorageAdapter` / `localStorageAdapter` / `sessionStorageAdapter` accept an `onError(error, operation)` callback — quota, blocked storage, and corrupt entries stay best-effort no-ops, but are no longer invisible.
  - **Dev diagnostics**: development-only warnings for conflicting bus options (first creator wins) and for a second store on one name in one tab (they can never sync).
  - **Dev-freeze fixes**: typed arrays no longer crash dev builds (freezing a non-empty view throws in every engine); Map/Set contents are now frozen; lazily registered initial values pass through the same guard as every other entry path.
  - **Observer isolation**: a throwing `observeBus` observer is contained and reported instead of breaking the bus it watches.
  - **Test-transport fidelity**: `MemoryHub` now structured-clones every delivery like the real BroadcastChannel — reference-identity payloads and non-cloneable values no longer pass in tests only to fail in production.

  Size budgets were raised to absorb the new lifecycle and safety machinery (the whole-surface budget goes 4.5 kB to 5 kB brotlied).

### Patch Changes

- [#37](https://github.com/rxova/use-everywhere/pull/37) [`0044801`](https://github.com/rxova/use-everywhere/commit/0044801e6f38f09483215a3c9248032c3b857f00) - Drop a key's listener bucket when its last subscriber unsubscribes. Per-item keys (`useSharedState(\`row-${id}\`, …)`) previously left one empty `Set` behind for every key that ever mounted, for the life of the page.

## 0.4.1

### Patch Changes

- [#31](https://github.com/rxova/use-everywhere/pull/31) [`b96b6e9`](https://github.com/rxova/use-everywhere/commit/b96b6e90230fb5363a0c5e732b5db238e06c3391) - Add the project logo as `assets/logo.svg` and show it above the title in the README. Documentation-only: no API, bundle, or runtime change.

## 0.4.0

### Minor Changes

- 833d69a: Ship a CommonJS build alongside ESM so `require('@use-everywhere/core')` resolves in Jest and other CJS toolchains, not just `import`. The `exports` map now serves per-condition types (`.d.ts`/`.d.cts`) and is clean under are-the-types-wrong across node10, node16 (CJS + ESM), and bundler.

  Also deep-freeze shared values in development: a store's `state` proxy is shallow, so an accidental in-place mutation (`store.state.list.push(x)`, or mutating a value you read) bumps no version clock and silently fails to sync. In dev that now throws a `TypeError` at the offending line; production strips the freeze entirely, so it costs nothing shipped.

## 0.3.0

### Minor Changes

- ad7f986: Add a debug seam: observeBus(name, fn) reports every wire crossing a bus in both directions, enableDebug() logs them to the console, and getBusNames() lists the live buses. Outbound wires are the point — a post goes straight to the transport, so until now nothing a client said was observable from inside it. Also exports DEFAULT_NAME and the BusWire/BusEvent types.
- 1ce8824: Add createLeader(name, options): opt-in leader election so exactly one tab owns the socket, the polling loop, or the token refresh. Lease-and-claim with a sticky incumbent — a new tab adopts the current leader instead of stealing the seat, a closing tab hands it over immediately, and a crashed one is replaced after the lease. Terms reuse the same newer() clock as the store, so crossing claims resolve deterministically. Leadership is advisory, not a distributed lock.
- 0bf735a: Add opt-in persistence. createSharedStore accepts a persist option; localStorageAdapter, sessionStorageAdapter, and webStorageAdapter store the state together with its version clocks, so a reopened tab re-enters the last-writer-wins race with its real term rather than a fresh zero. A restored value beats a staler live tab and loses to a newer one, and either way all tabs converge. Blocked storage, corrupt JSON, and a full quota degrade to a silent no-op. Stores also expose getVersions().
