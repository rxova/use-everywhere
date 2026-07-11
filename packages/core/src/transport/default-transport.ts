import { BroadcastChannelTransport } from './broadcast-channel-transport.js';
import { NoopTransport } from './noop-transport.js';
import type { Transport } from './transport.types.js';

export function isBroadcastChannelAvailable(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/** Default factory: real BroadcastChannel when available, otherwise a local no-op. */
export function defaultTransport(name: string): Transport {
  return isBroadcastChannelAvailable() ? new BroadcastChannelTransport(name) : new NoopTransport();
}
