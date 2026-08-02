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
    // Validate at post time even with nobody listening, exactly like the real
    // BroadcastChannel: a non-cloneable payload throws DataCloneError here.
    structuredClone(data);
    for (const transport of this.transports) {
      if (transport !== from) {
        // Clone per delivery: identity must never cross the wire, or tests
        // would pass on shared references that production message ports break.
        const copy = structuredClone(data);
        queueMicrotask(() => transport.deliver(copy));
      }
    }
  }

  /** @internal */
  disconnect(transport: MemoryTransport): void {
    this.transports.delete(transport);
  }
}
