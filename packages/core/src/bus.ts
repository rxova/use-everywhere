import { defaultTransport } from './transport/broadcast-channel.js';
import { newClientId } from './ids.js';
import { isBusWire, defaultKind, type BusWire, type CommonOptions, type PeerKind } from './types.js';

export interface BusOptions extends CommonOptions {
  /** Presence heartbeat interval in ms. Default 2000. */
  heartbeatMs?: number;
}

/**
 * One client identity on one named same-origin bus. Store, presence, and
 * channel engines for the same name share a bus (and thus one clientId and
 * one BroadcastChannel). The bus owns the presence heartbeat, so any client
 * on the bus is visible to peers even if it never creates a Presence.
 */
export interface Bus {
  readonly name: string;
  readonly clientId: string;
  readonly kind: PeerKind;
  post(wire: BusWire): void;
  subscribe(fn: (wire: BusWire) => void): () => void;
  /** Decrement the refcount; the bus shuts down when it reaches zero. */
  release(): void;
}

interface SharedBus extends Bus {
  acquire(): void;
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
    if (!closed) transport.post(wire);
  };

  const unsubscribe = transport.subscribe((data) => {
    if (!isBusWire(data)) return;
    if (data.clientId === clientId) return;
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
  const hasWindow = typeof document !== 'undefined' && typeof addEventListener === 'function';
  if (hasWindow) addEventListener('pagehide', sayBye);

  return {
    name,
    clientId,
    kind,
    post,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    acquire() {
      refs++;
    },
    release() {
      refs--;
      if (refs > 0) return;
      sayBye();
      closed = true;
      clearInterval(heartbeat);
      if (hasWindow) removeEventListener('pagehide', sayBye);
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
  }
  bus.acquire();
  return bus;
}
