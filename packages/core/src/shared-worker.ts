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
 * For a worker that also does other work — one that owns the WebSocket, say —
 * import {@link relay} and join the bus through it:
 *
 * ```js
 * // socket-worker.js
 * import { relay } from '@use-everywhere/core/shared-worker';
 * import { createSharedStore } from '@use-everywhere/core';
 *
 * const store = createSharedStore('feed', { tick: null }, { transport: () => relay.connect() });
 * new WebSocket('wss://example.com/feed').onmessage = (e) => store.set('tick', JSON.parse(e.data));
 * ```
 *
 * `startRelay` is exported for tests, which cannot install a global `onconnect`,
 * and for a scope this module cannot detect. Prefer {@link relay} inside a real
 * worker: calling `startRelay(self)` there installs a *second* relay over the
 * one this module already installed, and the first one's ports are then held by
 * a handler nothing will ever call again.
 */

import type { Transport } from './transport/transport.types.js';

export interface RelayPort {
  postMessage(data: unknown): void;
  start?: () => void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface RelayScope {
  onconnect: ((event: { ports: readonly RelayPort[] }) => void) | null;
}

/** A running relay: the ports it holds, and the worker's own seat on the bus. */
export interface Relay {
  /**
   * Join the relay from inside the worker, as one more peer.
   *
   * Returns a `Transport`, so worker-side code uses `createSharedStore` and the
   * rest of the library exactly as a tab does. That is the point: the wire
   * format stays the engines' business, and a worker that wants to publish
   * never has to hand-assemble an envelope the protocol might redefine.
   */
  connect(): Transport;
  /**
   * Fan raw data out to every connected port.
   *
   * The escape hatch, for a worker speaking some protocol of its own. Anything
   * the library's engines will read should go through {@link connect} instead —
   * this bypasses them entirely.
   */
  broadcast(data: unknown): void;
  /**
   * How many ports are attached. A live count of the contexts that opened this
   * worker, which is what you want in order to idle a socket while nobody is
   * looking. `connect()` seats are not counted: the worker is not its own tab.
   */
  readonly size: number;
}

/**
 * Fan every message out to the other connected peers.
 *
 * Three properties the buses above this depend on:
 *
 * 1. **No self-echo.** A sender never receives its own message, matching
 *    BroadcastChannel exactly. Without it every store would apply its own
 *    writes twice and every presence roster would count each tab as two.
 * 2. **A dead port is dropped, not thrown over.** A tab that goes away without
 *    closing its port leaves an entangled port whose `postMessage` throws; one
 *    of those must not stop delivery to the tabs still listening, so the send
 *    loop is individually guarded and the corpse is pruned.
 * 3. **The worker is a peer, not a special case.** A local seat from
 *    {@link Relay.connect} is held in the same set as the ports, so both rules
 *    above apply to it without a second code path to keep in agreement.
 */
export function startRelay(scope: RelayScope): Relay {
  /**
   * What fan-out actually needs from a peer. Narrower than `RelayPort` on
   * purpose: a local seat has nothing to listen *to*, and widening this would
   * force it to carry a no-op `addEventListener` that only ever satisfies a
   * type.
   */
  type Sink = Pick<RelayPort, 'postMessage'>;

  const ports = new Set<Sink>();
  const local = new Set<Sink>();

  // `from` is the no-self-echo rule, expressed once. `null` is the relay itself
  // speaking, which every peer should hear.
  const fanOut = (from: Sink | null, data: unknown): void => {
    const dead: Sink[] = [];
    for (const peer of ports) {
      if (peer === from) continue;
      try {
        peer.postMessage(data);
      } catch {
        dead.push(peer);
      }
    }
    for (const corpse of dead) {
      ports.delete(corpse);
      local.delete(corpse);
    }
  };

  scope.onconnect = (event) => {
    const port = event.ports[0];
    if (!port) return;
    ports.add(port);

    port.addEventListener('message', (message) => fanOut(port, message.data));
    port.start?.();
  };

  return {
    broadcast: (data) => fanOut(null, data),

    get size() {
      return ports.size - local.size;
    },

    connect(): Transport {
      const listeners = new Set<(data: unknown) => void>();
      let closed = false;

      // A local peer wearing the port shape, so fan-out cannot tell it apart.
      const seat: Sink = {
        // Asynchronous on purpose. `fanOut` runs inside a port's message
        // listener, and delivering synchronously from there produces the
        // re-entrancy a real MessagePort never could. Nothing is cloned: every
        // value reaching this seat already crossed a port boundary and was
        // structured-cloned there, so there is no live reference to leak.
        postMessage: (data) => {
          queueMicrotask(() => {
            for (const listener of listeners) listener(data);
          });
        },
      };
      ports.add(seat);
      local.add(seat);

      return {
        kind: 'shared-worker',
        post: (data) => {
          if (!closed) fanOut(seat, data);
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close: () => {
          if (closed) return;
          closed = true;
          listeners.clear();
          ports.delete(seat);
          local.delete(seat);
        },
      };
    },
  };
}

/**
 * The relay this module installed on import — present only when the module is
 * running in a SharedWorker, and `undefined` anywhere else, so that importing
 * it from a bundler tracing entry points, a test runner, or a server render is
 * inert rather than a `ReferenceError`.
 */
export const relay: Relay | undefined =
  typeof self !== 'undefined' && 'onconnect' in self
    ? startRelay(self as unknown as RelayScope)
    : undefined;
