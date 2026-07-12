import type { BusWire } from './bus.types.js';

/** One wire crossing the bus, in either direction. */
export interface BusEvent {
  /** The bus name the wire crossed. */
  readonly name: string;
  /** 'out' is posted by this client; 'in' is received from a peer. */
  readonly direction: 'in' | 'out';
  readonly wire: BusWire;
}

export type BusObserver = (event: BusEvent) => void;

export interface DebugOptions {
  /** Bus name to log. Defaults to the default store/channel name. */
  name?: string;
  /** Where to write. Defaults to console.log. */
  log?: (...args: unknown[]) => void;
}
