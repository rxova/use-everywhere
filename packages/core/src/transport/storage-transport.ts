import { diagnostic } from '../dev.js';
import { jsonSerializer, type Serializer } from '../serializer.js';
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
 *    The default serializer therefore *rejects* every value JSON would quietly
 *    change — a `Date`, a `Map`, a function — rather than let a write appear to
 *    succeed while peers receive something else. Pass a `Serializer` (devalue,
 *    superjson) to carry those instead.
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
  private serializer: Serializer;

  constructor(
    name: string,
    storage: Storage = globalThis.localStorage,
    serializer: Serializer = jsonSerializer,
  ) {
    // A bare `localStorage` default threw a bald `ReferenceError` in a worker,
    // where the global does not exist at all rather than being undefined.
    // `defaultTransport` never gets here — it probes first — but this class is
    // exported, so the direct caller is the one who needs telling why.
    if (!storage) {
      throw new Error(
        diagnostic(
          'UE1011',
          'StorageTransport needs localStorage; workers have none. Use BroadcastChannel there.',
        ),
      );
    }
    this.serializer = serializer;
    this.key = `use-everywhere:bus:${name}`;
    this.storage = storage;
    this.onStorage = (event) => {
      // Ignore the removal that follows every write, and anything on another key.
      if (event.key !== this.key || event.newValue === null) return;
      let payload: { data: unknown };
      try {
        payload = this.serializer.parse(event.newValue) as { data: unknown };
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
    const envelope = this.serializer.stringify({ seq: this.seq++, data });
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
