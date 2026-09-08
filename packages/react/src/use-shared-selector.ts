import { useCallback, useRef, useSyncExternalStore } from 'react';
import { DEFAULT_NAME, getStore } from './registry.js';
import type { UseSharedStateOptions } from './use-shared-state.types.js';

export interface UseSharedSelectorOptions extends UseSharedStateOptions {
  /**
   * Whether two selected values count as the same. Default `Object.is`.
   *
   * A selector returning an object or array builds a new one every time it
   * runs, so `Object.is` never matches and the component re-renders on every
   * write to the store. Pass a shallow comparison for those.
   */
  equal?: (a: unknown, b: unknown) => boolean;
}

/**
 * Read a derived value from a shared store, re-rendering only when it changes.
 *
 * `useSharedState` subscribes to one key, which is the right shape for reading
 * one thing. Reading *across* keys meant either one hook per key or a
 * subscription to the whole store, and the latter re-renders on every write to
 * anything in it.
 *
 * ```tsx
 * const total = useSharedSelector<Cart, number>(
 *   (cart) => cart.items.length + cart.saved.length,
 * );
 * ```
 *
 * The selector runs on every store change; the component only re-renders when
 * its result changes by `equal`.
 *
 * ## It reads, it does not declare
 *
 * `useSharedState(key, initial)` registers `key` with a default. A selector
 * does not — it sees whatever is in the store, so a key nothing has registered
 * or written yet is `undefined`. Write selectors that tolerate that, or declare
 * the defaults with `useSharedState` (or a store initial) somewhere that
 * mounts first.
 *
 * The same applies on a server, where the store is inert and empty: the
 * selector runs against `{}`, and its result is what the server-rendered markup
 * shows.
 */
export function useSharedSelector<S extends Record<string, unknown>, T>(
  selector: (state: S) => T,
  options?: UseSharedSelectorOptions,
): T {
  const store = getStore(options?.store ?? DEFAULT_NAME, options?.scope ?? 'everywhere');
  const equal = options?.equal ?? Object.is;

  // Kept fresh without resubscribing, so a selector defined inline — which is
  // a new function on every render — does not tear the subscription down.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(equal);
  equalRef.current = equal;

  /**
   * The last selection, and what produced it.
   *
   * `useSyncExternalStore` re-renders whenever the snapshot getter returns a
   * value it has not seen, so a selector building a fresh object each call
   * would loop forever. Caching against the *store* snapshot answers the common
   * case in one identity check; caching against the selector as well is what
   * keeps a changed selector from returning last render's answer.
   */
  const cache = useRef<{ source: unknown; select: unknown; value: T } | null>(null);

  const getSelection = useCallback(() => {
    const source = store.getSnapshot();
    const select = selectorRef.current;
    const previous = cache.current;
    if (previous && previous.source === source && previous.select === select) return previous.value;

    const next = select(source as S);
    // A new object that means the same thing is still the same thing: keeping
    // the previous reference is what actually prevents the re-render.
    const value = previous && equalRef.current(previous.value, next) ? previous.value : next;
    cache.current = { source, select, value };
    return value;
  }, [store]);

  return useSyncExternalStore(
    useCallback((onChange) => store.subscribe(onChange), [store]),
    getSelection,
    getSelection,
  );
}

/** Shallow equality over an object or array, for selectors that build one. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.is(left[key], right[key]));
}
