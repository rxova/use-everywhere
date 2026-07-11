import type { Transport } from './transport.types.js';

/**
 * Silent local transport: nothing leaves this context, nothing arrives.
 * Used for SSR and for state scoped to a single tab.
 */
export class NoopTransport implements Transport {
  post(): void {}

  subscribe(): () => void {
    return () => {};
  }

  close(): void {}
}
