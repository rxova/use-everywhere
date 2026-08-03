import type { BusOptions, Bus, BusWire, SharedBus } from './bus.types.js';
import type { PeerKind } from './common.types.js';
import { emitBusEvent } from './debug.js';
import { devWarn } from './dev.js';
import { newClientId } from './ids.js';
import { defaultTransport } from './transport/default-transport.js';

export function isBusWire(data: unknown): data is BusWire {
  if (typeof data !== 'object' || data === null) return false;
  const wire = data as { v?: unknown; scope?: unknown; type?: unknown; clientId?: unknown };
  // Beyond the version marker, check the three fields every branch downstream
  // reads unconditionally. The envelope is the only place a wire's shape is
  // ever verified, and everything past this point treats it as typed.
  return (
    wire.v === 1 &&
    typeof wire.scope === 'string' &&
    typeof wire.type === 'string' &&
    typeof wire.clientId === 'string'
  );
}

export function defaultKind(): PeerKind {
  return typeof document === 'undefined' ? 'worker' : 'tab';
}

const registry = new Map<string, SharedBus>();

function createBus(name: string, options: BusOptions, onShutdown: () => void): SharedBus {
  const transport = (options.transport ?? defaultTransport)(name);
  const clientId = newClientId();
  const kind = options.kind ?? defaultKind();
  const listeners = new Set<(wire: BusWire) => void>();
  let refs = 0;
  let closed = false;

  const post = (wire: BusWire) => {
    if (closed) return;
    emitBusEvent(name, 'out', wire);
    transport.post(wire);
  };

  const unsubscribe = transport.subscribe((data) => {
    if (!isBusWire(data)) return;
    if (data.clientId === clientId) return;
    emitBusEvent(name, 'in', data);
    // Introduce ourselves to joiners so they see existing peers immediately.
    if (data.scope === 'presence' && data.type === 'hello') {
      post({ v: 1, scope: 'presence', type: 'ping', clientId, kind });
    }
    for (const fn of listeners) fn(data);
  });

  // Presence heartbeat lives on the bus: hello on join, ping while alive, bye on leave.
  post({ v: 1, scope: 'presence', type: 'hello', clientId, kind });
  const heartbeat = setInterval(
    () => post({ v: 1, scope: 'presence', type: 'ping', clientId, kind }),
    options.heartbeatMs ?? 2000,
  );

  const sayBye = () => post({ v: 1, scope: 'presence', type: 'bye', clientId, kind });
  // A tab restored from bfcache said `bye` on the way out and heard nothing
  // while cached; re-announce so peers re-add us and re-ping in reply.
  const onPageShow = (event: Event) => {
    if (!(event as { persisted?: boolean }).persisted) return;
    post({ v: 1, scope: 'presence', type: 'hello', clientId, kind });
  };
  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  if (hasWindow) {
    addEventListener('pagehide', sayBye);
    addEventListener('pageshow', onPageShow);
  }

  return {
    name,
    clientId,
    kind,
    heartbeatMs: options.heartbeatMs ?? 2000,
    post,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    acquire() {
      refs++;
    },
    release() {
      // Guard direct-bus users double-releasing after shutdown; the engines
      // additionally make their own close() idempotent so a shared refcount
      // can never be decremented twice by one consumer.
      if (closed) return;
      refs--;
      if (refs > 0) return;
      sayBye();
      closed = true;
      clearInterval(heartbeat);
      if (hasWindow) {
        removeEventListener('pagehide', sayBye);
        removeEventListener('pageshow', onPageShow);
      }
      unsubscribe();
      transport.close();
      listeners.clear();
      onShutdown();
    },
  };
}

/**
 * Get the shared bus for `name`, creating it on first use. Callers must call
 * bus.release() exactly once when done. When a custom transport factory is
 * given (tests), every call creates an isolated bus — one call = one simulated client.
 */
/**
 * Names of the buses currently alive on this page. Buses built with a custom
 * transport (tests) bypass the registry, so they are not listed.
 */
export function getBusNames(): string[] {
  return [...registry.keys()];
}

export function getBus(name: string, options: BusOptions = {}): Bus {
  if (options.transport) {
    const bus = createBus(name, options, () => {});
    bus.acquire();
    return bus;
  }
  let bus = registry.get(name);
  if (!bus) {
    bus = createBus(name, options, () => registry.delete(name));
    registry.set(name, bus);
  } else {
    // The first creator fixes a bus's options; a differing later request would
    // otherwise be silently ignored — an origin-wide setting set from the
    // wrong call site with no test failing.
    if (options.heartbeatMs !== undefined && options.heartbeatMs !== bus.heartbeatMs) {
      devWarn(
        `[use-everywhere] bus "${name}": heartbeatMs ignored — the first creator fixes bus options`,
      );
    }
    if (options.kind !== undefined && options.kind !== bus.kind) {
      devWarn(`[use-everywhere] bus "${name}": kind ignored — the first creator fixes bus options`);
    }
  }
  bus.acquire();
  return bus;
}
