import type { Transport, TransportKind } from './transport.types.js';

/**
 * Cross-tab delivery over the `storage` event, for browsers with no
 * `BroadcastChannel`.
 *
 * The mechanism is a quirk turned to advantage: writing to `localStorage` fires
 * a `storage` event in *every other* same-origin tab and never in the writer —
 * exactly BroadcastChannel's no-self-echo semantics, for free.
 *
 * Two differences from the real thing, both deliberate and both documented:
 *
 * 1. **Fidelity is JSON, not structured clone.** `localStorage` holds strings.
 *    A `Date` arrives as an ISO string and a `Map` as `{}`. Values that cannot
 *    be represented at all — functions, symbols — are rejected rather than
 *    silently dropped, so a write still cannot leave this tab holding something
 *    its peers never received.
 * 2. **The entry is removed immediately after writing.** Peers have already been
 *    notified by then (the event carries the value), and leaving application
 *    state sitting in `localStorage` would be both a quota cost and a privacy
 *    one. The removal fires a second event with a null `newValue`, which
 *    receivers ignore.
 */
export class StorageTransport implements Transport {
  readonly kind: TransportKind = 'storage';
  private key: string;
  private storage: Storage;
  private listeners = new Set<(data: unknown) => void>();
  private onStorage: (event: StorageEvent) => void;
  private seq = 0;

  constructor(name: string, storage: Storage = localStorage) {
    this.key = `use-everywhere:bus:${name}`;
    this.storage = storage;
    this.onStorage = (event) => {
      // Ignore the removal that follows every write, and anything on another key.
      if (event.key !== this.key || event.newValue === null) return;
      let payload: { data: unknown };
      try {
        payload = JSON.parse(event.newValue) as { data: unknown };
      } catch {
        return; // not ours, or truncated
      }
      for (const listener of this.listeners) listener(payload.data);
    };
    addEventListener('storage', this.onStorage);
  }

  post(data: unknown): void {
    // `seq` makes every write a distinct string: `setItem` with an unchanged
    // value fires no storage event, so two identical posts in a row would
    // silently deliver once.
    const envelope = JSON.stringify({ seq: this.seq++, data }, rejectUnrepresentable);
    try {
      this.storage.setItem(this.key, envelope);
      this.storage.removeItem(this.key);
    } catch {
      // Quota or blocked storage. Nothing useful to do here — the bus already
      // treats delivery as best-effort, and throwing would take the caller's
      // write down with it.
    }
  }

  subscribe(listener: (data: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    removeEventListener('storage', this.onStorage);
  }
}

/**
 * JSON drops functions and symbols silently, which would let a write appear to
 * succeed while peers received something different — the exact divergence the
 * store's all-or-nothing write exists to prevent. Throwing keeps the contract
 * identical to the BroadcastChannel path, where the browser rejects them.
 */
function rejectUnrepresentable(_key: string, value: unknown): unknown {
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`${typeof value} values cannot be shared`);
  }
  return value;
}
