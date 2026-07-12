import type { PersistAdapter } from '@use-everywhere/core';
import type { AnyStore } from './registry.types.js';
import type { ShareScope } from './use-shared-state.types.js';

export interface DefineStoreOptions {
  /** Restore this store from disk on first use, and write it back as it changes. */
  persist?: PersistAdapter;
  /** Persist only these keys. Default: every key that has been written. */
  persistKeys?: string[];
  /** Coalesce disk writes for this long. Default 100. */
  persistDebounceMs?: number;
  /** How far this store is shared. Default 'everywhere'. */
  scope?: ShareScope;
}

/** A store bound to a name and a shape: typed hooks with no per-call generics. */
export interface StoreHooks<S extends Record<string, unknown>> {
  /** The underlying store instance (the same one the hooks use) — for non-React code. */
  get: () => AnyStore;
  useSharedState: <K extends keyof S & string>(
    key: K,
    initial: S[K],
  ) => [S[K], (next: S[K] | ((prev: S[K]) => S[K])) => void];
}
