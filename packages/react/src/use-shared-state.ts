import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_NAME, getStore } from './registry.js';
import type { UseSharedStateOptions } from './use-shared-state.types.js';

/**
 * Like useState, but the value exists in every tab, window, and worker on
 * this origin. Late-joining tabs hydrate to the current value; concurrent
 * writes converge last-writer-wins. Pass options.scope to delimit how much
 * is shared ('everywhere' | 'tabs' | 'tab').
 */
export function useSharedState<T>(
  key: string,
  initial: T,
  options?: UseSharedStateOptions,
): [T, (next: T | ((prev: T) => T)) => void] {
  const store = getStore(options?.store ?? DEFAULT_NAME, options?.scope ?? 'everywhere');
  // Idempotent: first registration wins, remote writes always beat the initial.
  store.registerKey(key, initial);

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
