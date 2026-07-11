import type { Transport } from './transport.js';

/**
 * In-memory hub for tests: N transports attached to one hub, each post is
 * delivered to every *other* transport on a microtask (mirrors BroadcastChannel's
 * async, no-self-echo delivery).
 */
export class MemoryHub {
  private transports = new Set<MemoryTransport>();

  connect(): MemoryTransport {
    const t = new MemoryTransport(this);
    this.transports.add(t);
    return t;
  }

  /** @internal */
  broadcast(from: MemoryTransport, data: unknown): void {
    for (const t of this.transports) {
      if (t !== from) {
        queueMicrotask(() => t.deliver(data));
      }
    }
  }

  /** @internal */
  disconnect(t: MemoryTransport): void {
    this.transports.delete(t);
  }
}

export class MemoryTransport implements Transport {
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
    for (const fn of this.listeners) fn(data);
  }
}
