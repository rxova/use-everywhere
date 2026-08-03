import type { MemoryHub } from './memory-hub.js';
import type { Transport, TransportKind } from './transport.types.js';

/** One simulated client on a MemoryHub. Create via hub.connect(). */
export class MemoryTransport implements Transport {
  readonly kind: TransportKind = 'memory';
  private listeners = new Set<(data: unknown) => void>();
  private closed = false;

  constructor(private hub: MemoryHub) {}

  post(data: unknown): void {
    if (this.closed) return;
    this.hub.broadcast(this, data);
  }

  subscribe(listener: (data: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.hub.disconnect(this);
  }

  /** @internal */
  deliver(data: unknown): void {
    if (this.closed) return;
    for (const listener of this.listeners) listener(data);
  }
}
