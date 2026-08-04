import type { BusOptions, Bus, BusWire, SharedBusCore } from './bus.types.js';
import type { PeerKind } from './common.types.js';
import type { TransportKind } from './transport/transport.types.js';
import { emitBusEvent } from './debug.js';
import { devWarn } from './dev.js';
import { newClientId } from './ids.js';
import { busTable } from './rendezvous.js';
import { defaultTransport } from './transport/default-transport.js';
import { foreignWireVersion, isBusWire, recordSkew } from './wire.js';

export { isBusWire };

export function defaultKind(): PeerKind {
  return typeof document === 'undefined' ? 'worker' : 'tab';
}

/**
 * Scopes that are shared *within* a client as well as between clients.
 *
 * A page is one client: it has one presence entry and one leader seat no matter
 * how many engines — or how many bundled copies of this library — are running
 * on it. Presence and leadership are therefore properties of the client, and
 * delivering them locally would make a page count itself as a peer and contend
 * with itself for its own seat.
 *
 * State and events are the opposite: two micro-frontends on one page have every
 * reason to share a store and hear each other's messages, and before this they
 * could not — a post goes to the transport, and no transport loops back to the
 * context that made it.
 */
const SHARED_WITHIN_CLIENT = new Set(['state', 'event', 'op']);

function createBusCore(name: string, options: BusOptions, onShutdown: () => void): SharedBusCore {
  const transport = (options.transport ?? defaultTransport)(name);
  const clientId = newClientId();
  const kind = options.kind ?? defaultKind();
  /** Every handle on this core — one per `getBus` call, so one per engine. */
  const handles = new Set<{ listeners: Set<(wire: BusWire) => void> }>();
  let refs = 0;
  let closed = false;

  /** Hand a wire to every handle except the one it came from (`null` = off the wire). */
  const deliver = (wire: BusWire, from: { listeners: Set<(wire: BusWire) => void> } | null) => {
    for (const handle of handles) {
      if (handle === from) continue;
      for (const fn of handle.listeners) fn(wire);
    }
  };

  const post = (wire: BusWire, from: { listeners: Set<(wire: BusWire) => void> } | null) => {
    if (closed) return;
    emitBusEvent(name, 'out', wire);
    transport.post(wire);
    // Synchronous, and deliberately so: a sibling engine on this page should
    // see a write in the same task, not a BroadcastChannel round trip later.
    // Re-entrancy is bounded because the engines only re-post on a *change* —
    // a patch that loses the last-writer-wins comparison is dropped, not echoed.
    if (SHARED_WITHIN_CLIENT.has(wire.scope)) deliver(wire, from);
  };

  const unsubscribe = transport.subscribe((data) => {
    // A wire that is plainly ours but speaks another protocol version is a
    // peer on a different deploy, not junk. Dropping it is still the only safe
    // thing to do with it, but the drop is recorded and warned about rather
    // than being indistinguishable from silence. See wire.ts for the contract.
    const foreign = foreignWireVersion(data);
    if (foreign !== null) {
      recordSkew(name, foreign);
      return;
    }
    if (!isBusWire(data)) return;
    if (data.clientId === clientId) return;
    emitBusEvent(name, 'in', data);
    // Introduce ourselves to joiners so they see existing peers immediately.
    if (data.scope === 'presence' && data.type === 'hello') {
      post({ v: 1, scope: 'presence', type: 'ping', clientId, kind }, null);
    }
    deliver(data, null);
  });

  // Presence heartbeat lives on the bus: hello on join, ping while alive, bye on leave.
  post({ v: 1, scope: 'presence', type: 'hello', clientId, kind }, null);
  const heartbeat = setInterval(
    () => post({ v: 1, scope: 'presence', type: 'ping', clientId, kind }, null),
    options.heartbeatMs ?? 2000,
  );

  const sayBye = () => post({ v: 1, scope: 'presence', type: 'bye', clientId, kind }, null);
  // A tab restored from bfcache said `bye` on the way out and heard nothing
  // while cached; re-announce so peers re-add us and re-ping in reply.
  const onPageShow = (event: Event) => {
    if (!(event as { persisted?: boolean }).persisted) return;
    post({ v: 1, scope: 'presence', type: 'hello', clientId, kind }, null);
  };
  // Coming back to the foreground: our timers were clamped while hidden, so
  // peers may have given up on us — and after a laptop wakes, every tab is in
  // that position at once. Re-announcing costs one wire and re-registers us
  // immediately instead of waiting for the next (still slow) heartbeat.
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      post({ v: 1, scope: 'presence', type: 'hello', clientId, kind }, null);
    }
  };
  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  if (hasWindow) {
    addEventListener('pagehide', sayBye);
    addEventListener('pageshow', onPageShow);
    addEventListener('visibilitychange', onVisible);
  }

  const shutdown = () => {
    sayBye();
    closed = true;
    clearInterval(heartbeat);
    if (hasWindow) {
      removeEventListener('pagehide', sayBye);
      removeEventListener('pageshow', onPageShow);
      removeEventListener('visibilitychange', onVisible);
    }
    unsubscribe();
    transport.close();
    handles.clear();
    onShutdown();
  };

  return {
    name,
    clientId,
    kind,
    transportKind: transport.kind ?? 'custom',
    heartbeatMs: options.heartbeatMs ?? 2000,
    connect(): Bus {
      const handle = { listeners: new Set<(wire: BusWire) => void>() };
      handles.add(handle);
      refs++;
      let released = false;
      return {
        name,
        clientId,
        kind,
        transportKind: transport.kind ?? 'custom',
        post: (wire) => post(wire, handle),
        subscribe(fn) {
          handle.listeners.add(fn);
          return () => handle.listeners.delete(fn);
        },
        release() {
          // Guard direct-bus users double-releasing after shutdown; the engines
          // additionally make their own close() idempotent so a shared refcount
          // can never be decremented twice by one consumer.
          if (released || closed) return;
          released = true;
          handles.delete(handle);
          handle.listeners.clear();
          refs--;
          if (refs === 0) shutdown();
        },
      };
    },
  };
}

/**
 * Names of the buses currently alive on this page. Buses built with a custom
 * transport (tests) bypass the table, so they are not listed.
 */
export function getBusNames(): string[] {
  return [...busTable().keys()];
}

/**
 * What is actually carrying this bus's traffic, or null if it has no bus yet.
 *
 * Answers the question a developer asks when nothing is syncing and the code
 * looks right: *is anything even connected?* `'none'` means no — writes are
 * local and no peer will ever see them.
 */
export function getTransportKind(name: string): TransportKind | null {
  return busTable().get(name)?.transportKind ?? null;
}

/**
 * Get a connection to the bus for `name`, creating the bus on first use.
 *
 * Every call returns its own handle: siblings on one page share an identity and
 * a transport, and hear each other's state and events, but each releases
 * independently. Callers must call `release()` exactly once when done.
 *
 * When a custom transport factory is given (tests), every call builds an
 * isolated bus instead — one call = one simulated client.
 */
export function getBus(name: string, options: BusOptions = {}): Bus {
  if (options.transport) return createBusCore(name, options, () => {}).connect();

  const table = busTable();
  let core = table.get(name);
  if (!core) {
    core = createBusCore(name, options, () => table.delete(name));
    table.set(name, core);
  } else {
    // The first creator fixes a bus's options; a differing later request would
    // otherwise be silently ignored — an origin-wide setting set from the
    // wrong call site with no test failing.
    if (options.heartbeatMs !== undefined && options.heartbeatMs !== core.heartbeatMs) {
      if (process.env.NODE_ENV !== 'production') {
        devWarn(
          `[use-everywhere] bus "${name}": heartbeatMs ignored — the first creator fixes bus options`,
        );
      }
    }
    if (options.kind !== undefined && options.kind !== core.kind) {
      if (process.env.NODE_ENV !== 'production') {
        devWarn(
          `[use-everywhere] bus "${name}": kind ignored — the first creator fixes bus options`,
        );
      }
    }
  }
  return core.connect();
}
