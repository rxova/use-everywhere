import { configureStore, getStore } from './registry.js';
import type { DefineStoreOptions, StoreHooks } from './define-store.types.js';
import { useSharedState } from './use-shared-state.js';

/**
 * Bind a store name — and optionally persistence — once, at module level.
 *
 * Like defineChannel, this does not construct anything: it registers the
 * options the registry will use when the store is first needed, so importing
 * the module has no side effect. The store stays a singleton per name, so
 * `defineStore('settings', { persist })` and a bare
 * `useSharedState('theme', 'dark', { store: 'settings' })` elsewhere resolve to
 * the same store, and both get persistence.
 *
 * Must run before that store exists. Module evaluation always precedes render,
 * so intended usage is automatic; if it does run late it throws rather than
 * quietly handing back a store with no persistence.
 */
export function defineStore<S extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  options: DefineStoreOptions = {},
): StoreHooks<S> {
  const scope = options.scope ?? 'everywhere';

  if (options.persist) {
    configureStore(name, scope, {
      persist: {
        adapter: options.persist,
        ...(options.persistKeys ? { keys: options.persistKeys } : {}),
        ...(options.persistDebounceMs === undefined
          ? {}
          : { debounceMs: options.persistDebounceMs }),
      },
    });
  }

  return {
    get: () => getStore(name, scope),
    useSharedState: <K extends keyof S & string>(key: K, initial: S[K]) =>
      useSharedState<S[K]>(key, initial, { store: name, scope }),
  };
}
