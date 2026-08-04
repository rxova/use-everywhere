import { useEffect, useState } from 'react';
import { DEFAULT_NAME, getStore } from './registry.js';
import type { UseSharedStateOptions } from './use-shared-state.types.js';

/**
 * Whether a persisted store has finished restoring.
 *
 * `false` on the first render, then `true` once the restore lands — including
 * the cases where there is nothing to restore, which settle immediately.
 *
 * Deliberately `false` first even for a synchronous adapter that has already
 * finished. The alternative is a value that differs between the server render
 * and the browser's hydrating render, which is a hydration mismatch on every
 * app that uses it — the same reason `useClientId` reports `''` until the
 * commit after hydration.
 *
 * The gap this closes only exists for **async** adapters, and it is one
 * last-writer-wins makes invisible: a keystroke landing before the restore
 * writes at counter 1, the restore arrives holding counter 5, and the newer
 * keystroke is correctly discarded. The behaviour is right; the surprise is
 * total. Gate the input and there is no gap:
 *
 * ```tsx
 * const ready = useHydrated({ store: 'settings' });
 * return <input disabled={!ready} value={draft} onChange={…} />;
 * ```
 *
 * A synchronous adapter — `localStorageAdapter` and friends — has already
 * restored by the time the store is handed back, so there is no gap to guard
 * and this simply flips to `true` in the commit after mount.
 */
export function useHydrated(options?: UseSharedStateOptions): boolean {
  const store = getStore(options?.store ?? DEFAULT_NAME, options?.scope ?? 'everywhere');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Resolved promises still settle a microtask later, so even the synchronous
    // case flips in a follow-up commit rather than during this effect. The
    // cancel flag is what keeps a store swapped mid-flight from resolving into
    // the wrong component.
    void store.hydrated.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  return ready;
}
