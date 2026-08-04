import type { BusWire } from './bus.types.js';
import type { BusEvent, BusObserver, DebugOptions } from './debug.types.js';
import { DEFAULT_NAME } from './defaults.js';
import { diagnostic } from './dev.js';

/**
 * Observers keyed by bus name, looked up at emit time rather than handed to
 * the bus at construction — which is why observing a name that has no bus yet
 * still works once one appears.
 */
const observers = new Map<string, Set<BusObserver>>();

/** @internal Called by the bus on every wire in and out. */
export function emitBusEvent(name: string, direction: 'in' | 'out', wire: BusWire): void {
  const set = observers.get(name);
  if (!set) return;
  const event: BusEvent = { name, direction, wire };
  for (const fn of set) {
    // Observers run synchronously inside the bus's hot path. A spectator must
    // never break the thing it watches, so a throwing observer is reported and
    // contained rather than allowed to abort the post or the receive.
    try {
      fn(event);
    } catch (error) {
      console.error(diagnostic('UE1012', `a bus observer for "${name}" threw`), error);
    }
  }
}

/**
 * Watch every wire crossing the named bus, in both directions. Outbound wires
 * are the interesting half: a post goes straight to the transport, so without
 * this seam nothing this client says is visible to it.
 *
 * Works for buses that do not exist yet — observe first, create later.
 */
export function observeBus(name: string, fn: BusObserver): () => void {
  let set = observers.get(name);
  if (!set) {
    set = new Set();
    observers.set(name, set);
  }
  set.add(fn);

  return () => {
    const current = observers.get(name);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) observers.delete(name);
  };
}

/** Log every wire on a bus to the console. Returns a function to stop. */
export function enableDebug(options: DebugOptions = {}): () => void {
  const name = options.name ?? DEFAULT_NAME;
  const log = options.log ?? ((...args: unknown[]) => console.log(...args));

  return observeBus(name, ({ direction, wire }) => {
    const arrow = direction === 'out' ? '→' : '←';
    log(`[use-everywhere:${name}] ${arrow} ${wire.scope}/${wire.type}`, wire);
  });
}
