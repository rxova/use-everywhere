import type { Version } from './common.types.js';

/**
 * What goes to disk. The version clocks travel *with* the values — that is the
 * whole point: a reopened tab re-enters the last-writer-wins race with its real
 * term instead of a fresh zero, so a restored value can legitimately beat, or
 * legitimately lose to, whatever the live tabs are holding.
 */
export interface Persisted {
  v: 1;
  state: Record<string, unknown>;
  versions: Record<string, Version>;
}

export interface PersistAdapter {
  /**
   * Prefer a synchronous read. An async adapter cannot hydrate before the store
   * is handed back, so a write made in that gap can be clobbered by the restore.
   */
  read(): Persisted | undefined | Promise<Persisted | undefined>;
  write(snapshot: Persisted): void | Promise<void>;
  remove?(): void | Promise<void>;
}

export interface PersistOptions {
  adapter: PersistAdapter;
  /** Persist only these keys. Default: every key that has been written. */
  keys?: string[];
  /** Coalesce writes for this long. Default 100. */
  debounceMs?: number;
}
