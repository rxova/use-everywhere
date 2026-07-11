import type { Transport } from './transport.types.js';

/** Same-origin transport over a real BroadcastChannel. */
export class BroadcastChannelTransport implements Transport {
  private bc: BroadcastChannel;
  private listeners = new Set<(data: unknown) => void>();

  constructor(name: string) {
    this.bc = new BroadcastChannel(name);
    this.bc.onmessage = (event) => {
      for (const listener of this.listeners) listener(event.data);
    };
  }

  post(data: unknown): void {
    this.bc.postMessage(data);
  }

  subscribe(listener: (data: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.bc.close();
  }
}
