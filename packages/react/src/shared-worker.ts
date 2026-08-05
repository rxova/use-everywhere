/**
 * The SharedWorker relay, re-exported so a React app still needs only one
 * dependency. Same module as '@use-everywhere/core/shared-worker'.
 *
 * ```js
 * // sw-relay.js — the file your app hosts and points the transport at
 * import 'use-everywhere/shared-worker';
 * ```
 *
 * Importing it installs the `connect` handler; `startRelay` is there for a
 * worker that does other work too.
 */
export { startRelay } from '@use-everywhere/core/shared-worker';
export type { RelayPort, RelayScope } from '@use-everywhere/core/shared-worker';
