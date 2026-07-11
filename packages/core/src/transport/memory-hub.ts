import { MemoryTransport } from './memory-transport.js';

/**
 * In-memory hub for tests: N transports attached to one hub, each post is
 * delivered to every *other* transport on a microtask (mirrors BroadcastChannel's
 * async, no-self-echo delivery).
 */
export class MemoryHub {
  private transports = new Set<MemoryTransport>();

  connect(): MemoryTransport {
    const transport = new MemoryTransport(this);
    this.transports.add(transport);
    return transport;
  }

  /** @internal */
  broadcast(from: MemoryTransport, data: unknown): void {
    for (const transport of this.transports) {
      if (transport !== from) {
        queueMicrotask(() => transport.deliver(data));
      }
    }
  }

  /** @internal */
  disconnect(transport: MemoryTransport): void {
    this.transports.delete(transport);
  }
}
