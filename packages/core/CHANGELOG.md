# @use-everywhere/core

## 0.7.0

### Minor Changes

- [#44](https://github.com/rxova/use-everywhere/pull/44) [`2b20291`](https://github.com/rxova/use-everywhere/commit/2b20291720c861f865abb50d5f853309d41399f7) - Fall back instead of silently doing nothing when `BroadcastChannel` is missing.

  `defaultTransport` used to hand back a `NoopTransport` in that case: every hook kept working, every write appeared to succeed, and nothing was ever shared with anybody. That is the worst failure this library can have, because it is indistinguishable from success.

  The chain is now `BroadcastChannelTransport` → `StorageTransport` → `NoopTransport`, and every step down warns in development.

  - **`StorageTransport`** rides a quirk of `localStorage`: writing fires a `storage` event in every _other_ same-origin tab and never in the writer — exactly the no-self-echo semantics the engines need. The entry is removed immediately after writing, so application state never lingers on disk. Fidelity is JSON rather than structured clone (a `Date` arrives as a string, a `Map` as `{}`), and values JSON cannot represent — functions, symbols — are **rejected rather than silently dropped**, preserving the all-or-nothing write guarantee.
  - **`getTransportKind(name)`** answers "is anything even connected?" — `'broadcast-channel' | 'storage' | 'none' | 'custom'`, or `null` when no bus exists for that name. A plain function, not a hook: a bus picks its transport once and keeps it for the life of the page.
  - **`isStorageEventAvailable()`** joins `isBroadcastChannelAvailable()`. It probes with a real write, because Safari's old private mode exposed a `localStorage` object that threw on every `setItem`.
  - `Transport` gains an optional `kind`; the shipped transports declare theirs, and a custom one without it reports as `'custom'`.

  Also: a presence engine attached to a bus that already existed now announces itself immediately rather than showing an empty roster until the next heartbeat.

- [#42](https://github.com/rxova/use-everywhere/pull/42) [`d28b81f`](https://github.com/rxova/use-everywhere/commit/d28b81fa407d5918ecf6378b5937b39bd26824e9) - Elect the leader with the Web Locks API where it exists.

  The heartbeat election has to infer that a leader is gone from silence, which is why it needs a lease — and why a backgrounded tab whose timers are clamped can be deposed while perfectly healthy, running the teardown in `useLeaderEffect` for no reason. With `navigator.locks` the browser owns the queue instead: failover on a crash is immediate rather than lease-length, holding the seat depends on no timer at all, and there is no periodic announce traffic.

  `strategy` defaults to `'auto'` — Web Locks when available, heartbeat otherwise. Web Locks is a **secure-context** API, so a plain-`http://` origin (an intranet app, a LAN staging box) keeps the heartbeat election; that fallback is load-bearing, not legacy. Pass `strategy: 'heartbeat'` to force it, or `strategy: 'web-locks'` to fail loudly rather than degrade silently. `leader.strategy` reports which one is in use.

  Also adds `waitForLeadership()`, which resolves when this client holds the seat (immediately if it already does) and rejects if the leader is closed while waiting, so an `await` in a tab being torn down cannot hang.

  One behavioural difference worth knowing: on the Web Locks strategy a lone eligible tab that calls `resign()` is handed the seat straight back, because re-queuing finds nobody else waiting. `resign()` moves the seat when there is somewhere for it to move.

- [#47](https://github.com/rxova/use-everywhere/pull/47) [`faa3aad`](https://github.com/rxova/use-everywhere/commit/faa3aadd0f0e787a557ee002f21ef3b62283fc8c) - Make several copies of the library on one page behave as one client.

  A module-scoped registry is per _bundle_, not per page. Two micro-frontends that each bundled their own copy therefore each built their own bus, their own clientId, and their own presence entry — so one page appeared to its peers as two tabs, contended with itself for the leader seat, and could not share state within itself at all, because a post goes to the transport and no transport loops back to the context that made it.

  Copies now find each other through a rendezvous point on `globalThis`, keyed by a versioned symbol, and share one bus per name: one identity, one presence entry, one leader seat. `getBus` returns a handle per call rather than the bus itself, so siblings release independently and the bus shuts down only when the last one lets go.

  State and event wires are additionally delivered **synchronously** to sibling handles on the same page — the difference between two micro-frontends sharing a store and merely converging on it after a round trip. Presence and leader wires are not, because those are properties of a client and a page is one client.

  Copies compiled against different rendezvous protocols cannot share live objects, so they partition — back to one client each, exactly as before this existed — and say so in development instead of leaving it to be discovered.

  This also fixes two shared stores on one name in one page, which previously could never hear each other. The development warning for that case remains, because paying twice for one store's state, subscriptions, and persistence writes is still usually a mistake, but it no longer claims they will diverge.

- [#45](https://github.com/rxova/use-everywhere/pull/45) [`358e9b5`](https://github.com/rxova/use-everywhere/commit/358e9b5eae2b0a0e120ab44b8e67ab4c52b00673) - Probe peers before pruning them, so a throttled tab is not mistaken for a dead one

  Browsers clamp a hidden tab's timers to roughly one tick a minute, so a healthy
  backgrounded peer stops heartbeating on schedule. Pruning on silence alone made
  the roster oscillate once a minute for a tab that never went anywhere.

  Message handlers are not throttled, only timers are — so a peer that goes quiet
  is now sent a `hello` and only removed if it stays silent through a further
  `probeGraceMs` (new option, default 1000ms). A peer that answers in time is never
  removed, so subscribers see no membership change rather than a drop and re-add.
  Buses also re-announce on `visibilitychange`, which re-registers a returning tab
  within a round trip instead of a heartbeat — the case that matters after a
  laptop wakes and every tab is throttled at once.

### Patch Changes

- [#40](https://github.com/rxova/use-everywhere/pull/40) [`a0cee27`](https://github.com/rxova/use-everywhere/commit/a0cee27dbc2f760af80410ed5c67c9d1c50ff42d) - Validate wires before trusting their shape. A peer posting a `patch` or leader `claim` whose `version`/`term` was not a version clock — a different deploy of your app mid-rollout, or any buggy script on the origin — reached `newer()` and threw a `TypeError` inside the receiving tab's message handler, where nothing catches it.

  The envelope check now also requires `scope`, `type`, and `clientId` to be strings, and malformed version clocks are dropped rather than applied. Found by the new property-based suite, which fuzzes arbitrary wires at a live store.

- [#46](https://github.com/rxova/use-everywhere/pull/46) [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b) - Raise every size budget to roughly 20% above its current measurement. The budgets had been tracking actual size so closely that unrelated work kept tripping them — five moves across M1 and M2 — and each one cost a review cycle that had nothing to do with the change under review. Entries that already had more than 20% of slack keep their existing limit rather than being tightened.

  This is deliberately headroom, not permission: the budgets still fail on a real regression, and the underlying cause of the drift — development-only warning strings surviving into production bundles — is unchanged and still scheduled.

- [#46](https://github.com/rxova/use-everywhere/pull/46) [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b) - Give `StorageTransport` a useful error where there is no `localStorage`.

  The default parameter referenced the bare global, so constructing one in a worker threw `ReferenceError: localStorage is not defined` — accurate and useless. `defaultTransport` never reaches that path because it probes first, but the class is exported, so a direct caller now gets told that workers have neither `localStorage` nor the storage event, and to use `BroadcastChannel` there.

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
