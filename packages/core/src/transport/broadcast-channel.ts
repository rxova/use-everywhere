import type { Transport } from './transport.js';

export function isBroadcastChannelAvailable(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

export class BroadcastChannelTransport implements Transport {
  private bc: BroadcastChannel;
  private listeners = new Set<(data: unknown) => void>();

  constructor(name: string) {
    this.bc = new BroadcastChannel(name);
    this.bc.onmessage = (event) => {
      for (const fn of this.listeners) fn(event.data);
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

/** Silent local transport for environments without BroadcastChannel (SSR, tests). */
export class NoopTransport implements Transport {
  post(): void {}
  subscribe(): () => void {
    return () => {};
  }
  close(): void {}
}

/** Default factory: real BroadcastChannel when available, otherwise a local no-op. */
export function defaultTransport(name: string): Transport {
  return isBroadcastChannelAvailable() ? new BroadcastChannelTransport(name) : new NoopTransport();
}
