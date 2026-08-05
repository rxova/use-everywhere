import type { Transport, TransportKind } from './transport.types.js';

/**
 * The subset of `SharedWorker` this transport uses. Narrower than the DOM type
 * on purpose: tests supply a fake, and a fake that has to implement
 * `EventTarget` to be accepted is a fake nobody writes.
 */
export interface SharedWorkerLike {
  readonly port: MessagePortLike;
}

export interface MessagePortLike {
  postMessage(data: unknown): void;
  start?: () => void;
  close(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface SharedWorkerTransportOptions {
  /**
   * The relay script. A `URL` rather than a string in the common case, because
   * `new URL('./relay.js', import.meta.url)` is what survives a bundler.
   *
   * It must be a *stable* URL, and that is the whole reason this option exists
   * rather than the library inlining a worker from a Blob the way it could for
   * a dedicated one: a SharedWorker's identity is its script URL plus its name,
   * and every tab that builds its own Blob URL gets its own worker. Inlining
   * would produce N private workers that share nothing — the failure this
   * transport exists to prevent, wearing the costume of a fix.
   */
  url: string | URL;
  /**
   * Distinguishes workers loaded from the same script. Defaults to the bus
   * name, which is what makes two buses on one origin independent.
   */
  name?: string;
  /**
   * Constructs the worker. Only tests should pass this; the default is
   * `globalThis.SharedWorker`.
   */
  factory?: (url: string, name: string) => SharedWorkerLike;
}

/**
 * Cross-tab delivery through one SharedWorker per origin.
 *
 * BroadcastChannel is the better default for pure fan-out and stays the
 * default. This transport buys something else: a single place that is not a
 * tab. The relay outlives any individual tab, so the thing every "the leader
 * owns the socket" design actually wants — one connection, held somewhere no
 * user can close mid-flight — becomes possible without electing a leader at
 * all.
 *
 * What it does not buy: durability. The worker is torn down when the last port
 * closes, exactly like a BroadcastChannel with no listeners. State still lives
 * in the tabs; this moves the *wire*, not the source of truth.
 *
 * The relay script is three lines and ships with the library:
 *
 * ```js
 * // sw-relay.js — your app hosts this file
 * import 'use-everywhere/shared-worker';
 * ```
 *
 * ```ts
 * createSharedStore('cart', {
 *   transport: new SharedWorkerTransport({
 *     url: new URL('./sw-relay.js', import.meta.url),
 *   }),
 * });
 * ```
 */
export class SharedWorkerTransport implements Transport {
  readonly kind: TransportKind = 'shared-worker';
  private port: MessagePortLike;
  private listeners = new Set<(data: unknown) => void>();
  private onMessage: (event: { data: unknown }) => void;
  private closed = false;

  constructor(options: SharedWorkerTransportOptions) {
    const name = options.name ?? 'use-everywhere';
    const factory =
      options.factory ??
      ((url: string, workerName: string) =>
        new SharedWorker(url, { name: workerName }) as SharedWorkerLike);

    const worker = factory(String(options.url), name);
    this.port = worker.port;

    this.onMessage = (event) => {
      for (const listener of this.listeners) listener(event.data);
    };
    this.port.addEventListener('message', this.onMessage);
    // `start()` is required whenever the port is used through addEventListener
    // rather than `onmessage` — without it the port never begins dispatching and
    // every message queues silently, which is the same shape of bug as having
    // no transport at all.
    this.port.start?.();
  }

  post(data: unknown): void {
    if (this.closed) return;
    this.port.postMessage(data);
  }

  subscribe(listener: (data: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.port.removeEventListener('message', this.onMessage);
    this.port.close();
  }
}

/**
 * Whether this context can construct a SharedWorker at all.
 *
 * Notably false in every dedicated worker (they cannot nest a SharedWorker) and
 * in Chrome on Android. Worth checking before choosing this transport, since
 * the constructor throws rather than degrading.
 */
export function isSharedWorkerAvailable(): boolean {
  return typeof SharedWorker !== 'undefined';
}
