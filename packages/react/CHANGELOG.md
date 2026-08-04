# use-everywhere

## 0.8.0

### Minor Changes

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`1a3f8d3`](https://github.com/rxova/use-everywhere/commit/1a3f8d3c7081650a75fb0a36c9937aabed742bf0) - `useMessage` takes options, and request/response gets hooks.

  **`useMessage(channel, type, handler, { enabled, once })`.** `enabled: false` unsubscribes rather than filtering inside the handler, so a component that is not interested costs nothing — and it is the answer to the thing you cannot do, which is call the hook conditionally.

  **`useAnswer(channel, type, responder)`** answers `ask`s for as long as the component is mounted, and stands down when it unmounts. A hook rather than a bare `channel.answer()` call because a responder is a subscription: registering one during render would leave the last unmounted component answering for the whole page. The responder is kept fresh without resubscribing, so it may close over render state.

  **`useAsk(channel)`** returns the channel's `ask` with a stable identity, like `useSend`.

  `useChannel` gains the optional reply-map type parameter:

  ```tsx
  const channel = useChannel<Requests, Replies>('app');
  useAnswer(channel, 'config:get', () => ({ theme }));
  const ask = useAsk(channel);
  ```

  Existing `useChannel<Requests>('app')` calls are unchanged — the reply map defaults to empty, which is what makes `ask`/`answer` opt-in rather than `unknown`.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`88fa0a0`](https://github.com/rxova/use-everywhere/commit/88fa0a0e9e892e8954c1591d25a9c2bf06b29896) - `createNamespace(name)` returns namespaced **hooks** as well as factories.

  The core namespace prefixes bus names; this is the half a React app actually uses. Call it at module scope, once per app, and export it:

  ```ts
  // checkout/bus.ts
  export const checkout = createNamespace('checkout');

  // anywhere in the checkout app
  const [items, setItems] = checkout.useSharedState('items', []);
  ```

  It carries the full surface — `useSharedState`, `usePeers`, `useClientId`, `useLeader`, `useIsLeader`, `useLeaderEffect`, `defineStore`, `defineChannel`, `getSharedStore` — plus the core factories underneath, for code outside React.

  Options keep their meanings: a `store` or `name` you pass is a name _within_ the namespace, and `scope` still says how far a value travels, which is a different axis entirely. `checkout.useSharedState('draft', '', { scope: 'tab' })` reads as the checkout app's bus, but never leaving this tab.

  Module scope matters: the namespace is a small object of bound functions, and rebuilding it every render would hand React a new `useSharedState` identity each time.

  New **Namespaces for micro-frontends** guide, including a table of the three things in this library that sound like "scope" and why they stay distinct.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`5c1e1c0`](https://github.com/rxova/use-everywhere/commit/5c1e1c000015cb4b2d68283861609c0491252077) - `defineChannel(name, options)` takes the new payload `schema` map.

  Channels had no options plumbing at all, so the seam core just gained was unreachable from React. `defineChannel` now mirrors `defineStore`: options are registered at module scope and applied when the channel is first needed, so declaring a schema still constructs nothing on import.

  ```ts
  const cart = defineChannel<{ 'item:add': Item }>('cart', {
    schema: { 'item:add': itemSchema },
  });
  ```

  Redefining with the same set of validated keys is a no-op, because Fast Refresh re-runs the defining module and rebuilds the schema objects on every edit — identity comparison would call a change that alters nothing a conflict. A genuine change after the channel exists warns, and the live channel keeps what it was built with.

  Also re-exports the `StandardSchemaV1`, `SchemaMap`, `SchemaOptions`, `InvalidPayload` and `OnInvalid` types from core.

  Three size budgets move up: `useSharedState`, `useChannel + useMessage + useSend` and `defineStore (persisted)`, tracking the core engines beneath them.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`f8ec259`](https://github.com/rxova/use-everywhere/commit/f8ec259b395dcf87d83a4894d575962b0ac1e1ad) - `defineStore` takes the new persistence options, and `useHydrated` gates UI on the restore.

  ```tsx
  const settings = defineStore('settings', {
    persist: localStorageAdapter('app:settings'),
    persistVersion: 2,
    migrate: (state, from) =>
      from < 2 ? { ...state, fullName: `${state.first} ${state.last}` } : state,
    onRestoreError: ({ reason }) => telemetry.warn('persist.restore', { reason }),
  });
  ```

  `useHydrated({ store })` is `false` on the first render and `true` once the restore lands — including when there is nothing to restore, which settles immediately.

  It starts `false` even for a synchronous adapter that has already finished, deliberately: a value that differed between the server render and the browser's hydrating render would be a hydration mismatch in every app that used it, which is the same reason `useClientId` reports `''` until the commit after hydration. The gap it exists for is real only for **async** adapters, and it is one last-writer-wins makes invisible — the store returns on its initial values, a keystroke writes at counter 1, the restore arrives holding counter 5, and the newer keystroke is correctly discarded.

  The server store double gained a resolved `hydrated`, so `await store.hydrated` proceeds during SSR rather than hanging — a server render has nothing to restore and is documented to render defaults.

  `persistVersion` is part of the store's config signature, so redefining with a different version after the store exists warns rather than being silently ignored. `migrate` is not, because Fast Refresh rebuilds the function on every edit.

  Four size budgets move up by ~180-270 B, tracking the core store beneath them.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`627d3c3`](https://github.com/rxova/use-everywhere/commit/627d3c3f5c41300c63cc1d6e56614a62a4170cbf) - Add `usePresenceMetadata`, and `usePeers({ includeSelf })`.

  ```tsx
  usePresenceMetadata({ name: user.name, editing: currentDocId });

  const everyone = usePeers({ includeSelf: true });
  ```

  Each peer now carries whatever it published about itself as `metadata`, which is what an avatar strip or a "who is editing this" indicator needs and had no way to get.

  Safe to call with a fresh object every render — the value is compared by contents, so an unchanged one announces nothing and re-renders nobody. Publishing happens in an effect rather than during render, because announcing is a side effect _on every other tab_, and a render React throws away must not be one other tabs already saw.

  `includeSelf` is part of the presence instance key rather than a per-call option: it changes what the roster _is_, and two components on one name disagreeing about it would otherwise silently get whichever answer was built first.

  Namespaces carry both, and the server double gained the matching no-op.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`0814974`](https://github.com/rxova/use-everywhere/commit/081497444beed267effddad1a5c44a86c9f2a1bc) - Add `useSharedStore(selector, options)` — derived reads without whole-store re-renders.

  `useSharedState` subscribes to one key, which is the right shape for reading one thing. Reading _across_ keys meant either one hook per key, or a subscription to the whole store — and the latter re-renders on every write to anything in it.

  ```tsx
  const total = useSharedStore<Cart, number>((cart) => cart.items.length + cart.saved.length);
  ```

  The selector runs on every store change; the component re-renders only when the result changes. `equal` chooses how that is decided (default `Object.is`), and **`shallowEqual` is exported** for the common case of a selector that builds an object or array — those produce a new reference every run, so without an equality function they defeat the very optimisation they were reached for.

  A selector defined inline is a new function on every render, and that is fine: the subscription is not torn down, and the cache keys on the selector as well as the store snapshot, so a _changed_ selector never returns the previous one's answer.

  **It reads; it does not declare.** `useSharedState(key, initial)` registers a key with a default. A selector sees whatever is in the store, so a key nothing has registered or written yet is `undefined` — write selectors that tolerate that, or declare the defaults somewhere that mounts first. The same applies on a server, where the store is inert and empty and the selector runs against `{}`.

  Namespaces carry it too: `checkout.useSharedStore(…)` selects from the namespaced store.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`0989a2c`](https://github.com/rxova/use-everywhere/commit/0989a2ce24d7f2e894298f55fd99bc22c726c957) - Add `useSharedReducer` — `useReducer`, with every tab applying the same actions in the same order.

  ```tsx
  const [count, dispatch] = useSharedReducer((n, action) => n + action.by, 0);
  <button onClick={() => dispatch({ by: 1 })}>{count}</button>;
  ```

  Reach for it whenever a write is _relative to what is already there_ — a counter, a running total, a list you append to. `useSharedState` converges last-writer-wins on the value, so two tabs incrementing at once both write the same result and one increment vanishes. For a plain register — theme, selection, draft — `useSharedState` is still the right tool and the cheaper one.

  The reducer shares this tab's existing leader rather than electing a second one, `dispatch` keeps a stable identity so it is safe in a dependency array, and several reducers coexist on one bus by `key`.

  Server renders get an inert double: the initial value, and a `dispatch` that does nothing. A server has no peers to order actions with, so producing a value the browser is about to disagree with would be a hydration mismatch by construction.

  **The first caller's reducer wins** for the life of the page. A re-render passes a new function identity every time, and swapping the fold under a history already applied is exactly the divergence an ordered reducer exists to prevent.

  New **Counters and reducers** guide covers when to reach for which primitive, and what the ordering does and does not promise.

- [#52](https://github.com/rxova/use-everywhere/pull/52) [`21a4c33`](https://github.com/rxova/use-everywhere/commit/21a4c33266bceef06b8577d0b59ae2083141f94a) - Re-export `getWireSkew` and `WIRE_VERSION` from core.

  A React app installs one package, so anything core adds that an application would reach for has to be enumerated here too. `getWireSkew(name)` is how a running app finds out that another generation of its own bundle is open in a neighbouring tab — the case a rolling deploy creates every time — and gating a "reload for the latest version" banner on it is the reason it exists.

  Two size budgets move up by ~150 B: `useChannel + useMessage + useSend` and `usePeers + useClientId`, the two smallest entries, which carry the bus and therefore the skew check. Most of that is the development warning string, which survives into production bundles until dev-only stripping lands — the warning was written terse with the explanation behind a link for exactly that reason, and this is what it costs after that.

### Patch Changes

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`2eaf24a`](https://github.com/rxova/use-everywhere/commit/2eaf24abc2e5f5b1ffe1948dae9736f95c1f00bd) - Keep development warnings out of production bundles.

  The same change as core: every `devWarn` call site now carries the literal `process.env.NODE_ENV !== 'production'` guard, so a bundler folds the branch and drops the string with it.

  `useSharedState` guards the whole `warnOnInitialMismatch` call rather than returning early inside it. With the branch folded away the function is unreferenced, so the bundler drops it, its Map of seen initials, and its message together — an early return would have kept all three.

  Every size budget is retightened to the new measurement, most of them **below where they stood before this stack started**, despite the features that landed on it.

  A browser loading this ESM directly, with no bundler to define `process`, now throws a `ReferenceError`. Bundle the package, or shim `process.env.NODE_ENV`. See the core changeset for why the `typeof` guard that would avoid this was rejected.

- Updated dependencies [[`1a3f8d3`](https://github.com/rxova/use-everywhere/commit/1a3f8d3c7081650a75fb0a36c9937aabed742bf0), [`2eaf24a`](https://github.com/rxova/use-everywhere/commit/2eaf24abc2e5f5b1ffe1948dae9736f95c1f00bd), [`8318285`](https://github.com/rxova/use-everywhere/commit/8318285c398904dd6d6bd0237ccb3f71550a85a5), [`88fa0a0`](https://github.com/rxova/use-everywhere/commit/88fa0a0e9e892e8954c1591d25a9c2bf06b29896), [`5c1e1c0`](https://github.com/rxova/use-everywhere/commit/5c1e1c000015cb4b2d68283861609c0491252077), [`f8ec259`](https://github.com/rxova/use-everywhere/commit/f8ec259b395dcf87d83a4894d575962b0ac1e1ad), [`627d3c3`](https://github.com/rxova/use-everywhere/commit/627d3c3f5c41300c63cc1d6e56614a62a4170cbf), [`4ca1aa4`](https://github.com/rxova/use-everywhere/commit/4ca1aa431124ec3ea3b9016f201a49de4d5dd73f), [`0989a2c`](https://github.com/rxova/use-everywhere/commit/0989a2ce24d7f2e894298f55fd99bc22c726c957), [`c181625`](https://github.com/rxova/use-everywhere/commit/c1816257a729687143a4f54f86471efd1f8ea1e5), [`21a4c33`](https://github.com/rxova/use-everywhere/commit/21a4c33266bceef06b8577d0b59ae2083141f94a)]:
  - @use-everywhere/core@0.8.0

## 0.7.0

### Minor Changes

- [#44](https://github.com/rxova/use-everywhere/pull/44) [`2b20291`](https://github.com/rxova/use-everywhere/commit/2b20291720c861f865abb50d5f853309d41399f7) - Re-export the transport chain from the core: `StorageTransport`, `getTransportKind`, `isStorageEventAvailable`, and the `TransportKind` type. A browser with no `BroadcastChannel` now falls back to the `storage` event rather than silently sharing nothing, and `getTransportKind()` reports what is actually carrying traffic.

- [#42](https://github.com/rxova/use-everywhere/pull/42) [`d28b81f`](https://github.com/rxova/use-everywhere/commit/d28b81fa407d5918ecf6378b5937b39bd26824e9) - `useLeader` inherits the Web Locks election from the core: in any secure context a hidden or throttled tab keeps the seat, and failover after a crash is immediate rather than lease-length. Plain-`http://` origins keep the heartbeat election. Re-exports the new `LeaderStrategy` type; `getLeader(name).waitForLeadership()` is available for imperative code.

### Patch Changes

- [#46](https://github.com/rxova/use-everywhere/pull/46) [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b) - Raise every size budget to roughly 20% above its current measurement, matching the core package. Entries that already had more than 20% of slack keep their existing limit rather than being tightened.

  Headroom, not permission: the budgets still fail on a real regression.

- Updated dependencies [[`a0cee27`](https://github.com/rxova/use-everywhere/commit/a0cee27dbc2f760af80410ed5c67c9d1c50ff42d), [`2b20291`](https://github.com/rxova/use-everywhere/commit/2b20291720c861f865abb50d5f853309d41399f7), [`d28b81f`](https://github.com/rxova/use-everywhere/commit/d28b81fa407d5918ecf6378b5937b39bd26824e9), [`faa3aad`](https://github.com/rxova/use-everywhere/commit/faa3aadd0f0e787a557ee002f21ef3b62283fc8c), [`358e9b5`](https://github.com/rxova/use-everywhere/commit/358e9b5eae2b0a0e120ab44b8e67ab4c52b00673), [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b), [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b)]:
  - @use-everywhere/core@0.7.0

## 0.6.0

### Minor Changes

- [#38](https://github.com/rxova/use-everywhere/pull/38) [`7e2e2e6`](https://github.com/rxova/use-everywhere/commit/7e2e2e61e19caa2fbc3691c4470f36a92e9684f2) - Enumerate the re-exported core surface instead of `export * from '@use-everywhere/core'`, and move the test seams to a `testing` subpath.

  ```diff
  -import { MemoryHub } from 'use-everywhere';
  +import { MemoryHub } from 'use-everywhere/testing';
  ```

  The wildcard made this package's public API implicitly whatever core happened to export, so anything added to core became a 1.0 compatibility promise here without a decision being made. The re-export list is now explicit; every name on it is deliberate. The full runtime surface is unchanged apart from the test seams moving.

### Patch Changes

- Updated dependencies [[`7e2e2e6`](https://github.com/rxova/use-everywhere/commit/7e2e2e61e19caa2fbc3691c4470f36a92e9684f2)]:
  - @use-everywhere/core@0.6.0

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
