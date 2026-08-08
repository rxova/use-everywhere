import { createSharedStore } from '@use-everywhere/core';
import { relay } from '@use-everywhere/core/shared-worker';

/**
 * The SharedWorker half of the relay fixture: a worker that both **hosts** the
 * relay and **publishes** over it, which is the shape `relay.connect()` exists
 * for.
 *
 * It stands in for the worker that owns the WebSocket. There is no socket here
 * — a fixture that opened one would be testing the network — so a timer plays
 * the part of arriving server messages, and `socketId` plays the part of the
 * connection itself: minted once, when this worker starts.
 *
 * That id is what makes "one connection for the whole origin" observable. Two
 * tabs reading the *same* id can only have reached the same worker; a pair that
 * each spawned their own would be on two relays with two ids, unable to
 * converge, because separate relays are separate port sets.
 *
 * Built as a classic IIFE by `build-fixtures.mjs`, not served as a module:
 * `SharedWorkerTransport` constructs `new SharedWorker(url, { name })`, and a
 * worker without `type: 'module'` cannot carry `import`.
 */

// `relay` is undefined anywhere that is not a SharedWorker. Bound to a local so
// the narrowing survives into the transport factory below.
const hosted = relay;
if (!hosted) throw new Error('relay fixture: not running inside a SharedWorker');

const store = createSharedStore(
  'relay-fixture',
  { tick: 0, socketId: '' },
  // The worker joins its own relay as one more peer. Everything below is
  // ordinary store code — the point being that it has to be.
  { transport: () => hosted.connect(), kind: 'worker' },
);

// Written once, at startup, and never again. A tab that arrives later can only
// learn it from the late-joiner handshake; nothing re-broadcasts it.
store.set('socketId', Math.random().toString(36).slice(2, 10));

setInterval(() => store.set('tick', (t) => t + 1), 250);
