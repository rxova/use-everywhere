/**
 * The relay that runs *inside* a SharedWorker. Host a one-line module and point
 * `SharedWorkerTransport` at it:
 *
 * ```js
 * // sw-relay.js
 * import '@use-everywhere/core/shared-worker';
 * ```
 *
 * Importing this module installs the `connect` handler, which is why the entry
 * point is a side effect rather than a function you call: a SharedWorker script
 * has one job, and making the caller remember to invoke it adds a way to get a
 * worker that accepts connections and forwards nothing.
 *
 * `startRelay` is exported anyway, for a worker that also does other work — an
 * app whose relay owns the WebSocket, say — and for tests, which cannot install
 * a global `onconnect`.
 */

export interface RelayPort {
  postMessage(data: unknown): void;
  start?: () => void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface RelayScope {
  onconnect: ((event: { ports: readonly RelayPort[] }) => void) | null;
}

/**
 * Fan every message out to the other connected ports.
 *
 * Two properties the buses above this depend on:
 *
 * 1. **No self-echo.** A sender never receives its own message, matching
 *    BroadcastChannel exactly. Without it every store would apply its own
 *    writes twice and every presence roster would count each tab as two.
 * 2. **A dead port is dropped, not thrown over.** A tab that goes away without
 *    closing its port leaves an entangled port whose `postMessage` throws; one
 *    of those must not stop delivery to the tabs still listening, so the send
 *    loop is individually guarded and the corpse is pruned.
 */
export function startRelay(scope: RelayScope): void {
  const ports = new Set<RelayPort>();

  scope.onconnect = (event) => {
    const port = event.ports[0];
    if (!port) return;
    ports.add(port);

    port.addEventListener('message', (message) => {
      const dead: RelayPort[] = [];
      for (const peer of ports) {
        if (peer === port) continue;
        try {
          peer.postMessage(message.data);
        } catch {
          dead.push(peer);
        }
      }
      for (const corpse of dead) ports.delete(corpse);
    });
    port.start?.();
  };
}

// A SharedWorker's global scope is where `onconnect` lives. Guarded, so that
// importing this module anywhere else — a bundler tracing entry points, a test
// runner, a server render — is inert rather than a ReferenceError.
if (typeof self !== 'undefined' && 'onconnect' in self) {
  startRelay(self as unknown as RelayScope);
}
