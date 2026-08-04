import { devWarn } from '../dev.js';
import { BroadcastChannelTransport } from './broadcast-channel-transport.js';
import { NoopTransport } from './noop-transport.js';
import { StorageTransport } from './storage-transport.js';
import type { Transport } from './transport.types.js';

export function isBroadcastChannelAvailable(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/**
 * Can we hear other tabs through the `storage` event?
 *
 * Reading `localStorage` is itself what throws when storage is blocked — a
 * sandboxed iframe, third-party cookies off — so the check has to happen inside
 * a try, not around a property test. Availability is also not writability:
 * Safari's old private mode exposed the object and threw on every setItem.
 */
export function isStorageEventAvailable(): boolean {
  if (typeof addEventListener !== 'function') return false;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const probe = 'use-everywhere:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick the best wire this browser can offer, and say so when it is not the
 * good one.
 *
 * The chain matters more than it looks. Before it existed, a context without
 * `BroadcastChannel` got a silent no-op: every hook kept working, every write
 * appeared to succeed, and nothing was ever shared with anybody. That is the
 * worst failure this library can have, because it looks exactly like success.
 */
export function defaultTransport(name: string): Transport {
  if (isBroadcastChannelAvailable()) return new BroadcastChannelTransport(name);

  if (isStorageEventAvailable()) {
    if (process.env.NODE_ENV !== 'production') {
      devWarn(
        '[use-everywhere] no BroadcastChannel; using the storage-event fallback. Values serialise as JSON, not structured clone — keep them JSON-shaped.',
      );
    }
    return new StorageTransport(name);
  }

  if (process.env.NODE_ENV !== 'production') {
    devWarn(
      '[use-everywhere] no BroadcastChannel and no usable localStorage: nothing is shared between tabs. Storage is probably blocked.',
    );
  }
  return new NoopTransport();
}
