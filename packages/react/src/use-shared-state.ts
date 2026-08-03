import { useCallback, useSyncExternalStore } from 'react';
import { warnOnInitialMismatch } from './dev.js';
import { DEFAULT_NAME, getStore } from './registry.js';
import type { UseSharedStateOptions } from './use-shared-state.types.js';

/**
 * Like useState, but the value exists in every tab, window, and worker on
 * this origin. Late-joining tabs hydrate to the current value; concurrent
 * writes converge last-writer-wins. Pass options.scope to delimit how much
 * is shared ('everywhere' | 'tabs' | 'tab').
 *
 * Note the convergence rule is last-writer-wins per key, not per operation:
 * two tabs running `set(n => n + 1)` at the same moment agree on one value,
 * and one of the increments is lost. For counters and other accumulating
 * writes, drive them from a single tab (useLeaderEffect) until an op-based
 * primitive lands.
 */
export function useSharedState<T>(
  key: string,
  initial: T,
  options?: UseSharedStateOptions,
): [T, (next: T | ((prev: T) => T)) => void] {
  const storeName = options?.store ?? DEFAULT_NAME;
  const store = getStore(storeName, options?.scope ?? 'everywhere');
  // Idempotent: first registration wins, remote writes always beat the initial.
  store.registerKey(key, initial);
  warnOnInitialMismatch(storeName, key, initial);

  const value = useSyncExternalStore(
    useCallback((onChange) => store.subscribeKey(key, onChange), [store, key]),
    () => store.getSnapshot()[key] as T,
    () => initial,
  );

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => store.set(key, next as unknown),
    [store, key],
  );

  return [value, setValue];
}
