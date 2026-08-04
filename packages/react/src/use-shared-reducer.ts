import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_NAME, getReducer } from './registry.js';

export interface UseSharedReducerOptions {
  /** Bus name. Default 'use-everywhere'. */
  name?: string;
  /** Which reducer this is, when several share a bus. Default 'default'. */
  key?: string;
}

/**
 * Like `useReducer`, but every tab, window, and worker on this origin applies
 * the same actions in the same order.
 *
 * ```tsx
 * const [count, dispatch] = useSharedReducer((n, action) => n + action.by, 0);
 * <button onClick={() => dispatch({ by: 1 })}>{count}</button>;
 * ```
 *
 * Reach for this instead of `useSharedState` whenever a write is *relative to
 * what is already there* — a counter, a total, a list you append to. Shared
 * state converges last-writer-wins on the value, so two tabs incrementing at
 * once both write the same result and one increment vanishes. A reducer sends
 * the action rather than the result, and two increments are two actions.
 *
 * For a plain register — a theme, a selection, a draft — `useSharedState` is
 * still the right tool and the cheaper one.
 *
 * ## The rules
 *
 * **Actions must survive the wire.** They are structured-cloned to every peer,
 * so no functions, no class instances, no DOM nodes.
 *
 * **The reducer must be pure**, and it must be the *same* reducer everywhere.
 * Every client folds the same actions itself; a client whose fold differs gets
 * a different answer, and nothing can detect that. The first caller's function
 * is the one used for the life of the page — a re-render passes a new identity
 * every time, and swapping the fold under a history already applied is exactly
 * the divergence this exists to prevent.
 *
 * **Ordering needs a leader**, which this shares with `useLeader` on the same
 * bus rather than electing a second one. Before a seat is filled — the first
 * moments of the first tab — dispatches are held locally and ordered once it
 * is. They are never lost, only pending.
 */
export function useSharedReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
  options?: UseSharedReducerOptions,
): [S, (action: A) => void] {
  const engine = getReducer<S, A>(
    options?.name ?? DEFAULT_NAME,
    options?.key ?? 'default',
    reducer,
    initial,
  );

  const value = useSyncExternalStore(
    useCallback((onChange) => engine.subscribe(onChange), [engine]),
    () => engine.getSnapshot(),
    () => initial,
  );

  const dispatch = useCallback((action: A) => engine.dispatch(action), [engine]);

  return [value, dispatch];
}
