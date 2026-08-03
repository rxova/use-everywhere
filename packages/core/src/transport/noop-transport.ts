import type { Transport, TransportKind } from './transport.types.js';

/**
 * Silent local transport: nothing leaves this context, nothing arrives.
 * Used for SSR and for state scoped to a single tab.
 */
export class NoopTransport implements Transport {
  readonly kind: TransportKind = 'none';

  post(): void {}

  subscribe(): () => void {
    return () => {};
  }

  close(): void {}
}
