# @use-everywhere/core

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
