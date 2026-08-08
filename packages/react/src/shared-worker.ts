/**
 * The SharedWorker relay, re-exported so a React app still needs only one
 * dependency. Same module as '@use-everywhere/core/shared-worker'.
 *
 * ```js
 * // sw-relay.js — the file your app hosts and points the transport at
 * import 'use-everywhere/shared-worker';
 * ```
 *
 * Importing it installs the `connect` handler; `relay` is that handler's own
 * seat on the bus, for a worker that does other work too — one that owns the
 * WebSocket and publishes what arrives on it.
 */
export { startRelay, relay } from '@use-everywhere/core/shared-worker';
export type { Relay, RelayPort, RelayScope } from '@use-everywhere/core/shared-worker';
