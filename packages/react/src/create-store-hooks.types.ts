import type { PersistAdapter, RestoreError } from '@use-everywhere/core';
import type { AnyStore } from './registry.types.js';
import type { ShareScope } from './use-shared-state.types.js';

export interface CreateStoreHooksOptions {
  /** Restore this store from disk on first use, and write it back as it changes. */
  persist?: PersistAdapter;
  /** Persist only these keys. Default: every key that has been written. */
  persistKeys?: string[];
  /** Coalesce disk writes for this long. Default 100. */
  persistDebounceMs?: number;
  /**
   * The version of your persisted state's shape. Bump it whenever a key changes
   * meaning or type, and supply `migrate` to carry old data forward. Default 0,
   * which is also what anything written before this existed reads as.
   */
  persistVersion?: number;
  /** Bring persisted state written at an older `persistVersion` up to the current one. */
  migrate?: (state: Record<string, unknown>, from: number) => Record<string, unknown>;
  /** Called when persisted state is refused instead of restored. Defaults to a development warning. */
  onRestoreError?: (error: RestoreError) => void;
  /** How far this store is shared. Default 'everywhere'. */
  scope?: ShareScope;
}

/** A store bound to a name and a shape: typed hooks with no per-call generics. */
export interface StoreHooks<S extends Record<string, unknown>> {
  /** The underlying store instance (the same one the hooks use) — for non-React code. */
  store: () => AnyStore;
  useSharedState: <K extends keyof S & string>(
    key: K,
    initial: S[K],
  ) => [S[K], (next: S[K] | ((prev: S[K]) => S[K])) => void];
}
