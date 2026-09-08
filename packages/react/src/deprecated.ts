// The 0.x spellings of the names RFC 0001 renamed, kept working for the rest of
// the 0.x line and removed in 1.0.
//
// Every entry here is a wrapper rather than `export const useMessage =
// useOnMessage`, which is what the RFC sketched. An alias is one binding, so
// there is no call site to warn from — and a rename people find out about at
// the 1.0 type error is a rename that costs them a debugging session rather
// than a codemod run. The wrapper is the warning's only place to live.
//
// The warnings fire once per name per session, not per call: these are hooks,
// and a diagnostic inside a hook is a diagnostic sixty times a second. `devWarn`
// already dedupes on the message, so passing a constant string per name is the
// whole mechanism.
//
// Wrapping a hook is safe in a way wrapping an arbitrary function is not — each
// wrapper calls exactly one hook, unconditionally, so the hook order a component
// sees through the old name is the order it sees through the new one.
import type {
  MessageMap,
  MessageMeta,
  Channel,
  ReplyMap,
  OpenedWindow,
} from '@use-everywhere/core';
import { warnRenamed } from './dev.js';
import { useOnMessage, type UseOnMessageOptions } from './use-on-message.js';
import { useWindowResult } from './use-window-result.js';
import type { UseWindowResult } from './use-window-result.types.js';
import { createStoreHooks } from './create-store-hooks.js';
import type { CreateStoreHooksOptions, StoreHooks } from './create-store-hooks.types.js';
import { useSharedSelector, type UseSharedSelectorOptions } from './use-shared-selector.js';

/**
 * @deprecated Renamed to `useOnMessage`. Removed in 1.0 — `npx use-everywhere-codemod rename-1.0 src/`.
 */
export function useMessage<M extends MessageMap, R extends ReplyMap<M>, K extends keyof M & string>(
  channel: Channel<M, R>,
  type: K,
  handler: (payload: M[K], meta: MessageMeta) => void,
  options?: UseMessageOptions,
): void {
  warnRenamed('useMessage', 'useOnMessage');
  useOnMessage(channel, type, handler, options);
}

/**
 * @deprecated Renamed to `useWindowResult`. Removed in 1.0 — `npx use-everywhere-codemod rename-1.0 src/`.
 */
export function useOpenedWindow<Out extends MessageMap, In extends MessageMap, R = unknown>(
  factory: () => OpenedWindow<Out, In, R>,
): UseWindowResult<Out, In, R> {
  warnRenamed('useOpenedWindow', 'useWindowResult');
  return useWindowResult(factory);
}

/**
 * @deprecated Renamed to `useSharedSelector`. Removed in 1.0 — `npx use-everywhere-codemod rename-1.0 src/`.
 */
export function useSharedStore<S extends Record<string, unknown>, T>(
  selector: (state: S) => T,
  options?: UseSharedSelectorOptions,
): T {
  warnRenamed('useSharedStore', 'useSharedSelector');
  return useSharedSelector(selector, options);
}

/**
 * @deprecated Renamed to `createStoreHooks`. Removed in 1.0 — `npx use-everywhere-codemod rename-1.0 src/`.
 */
export function defineStore<S extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  options: DefineStoreOptions = {},
): StoreHooks<S> {
  warnRenamed('defineStore', 'createStoreHooks');
  return createStoreHooks<S>(name, options);
}

/** @deprecated Renamed to `UseOnMessageOptions`. Removed in 1.0. */
export type UseMessageOptions = UseOnMessageOptions;
/** @deprecated Renamed to `CreateStoreHooksOptions`. Removed in 1.0. */
export type DefineStoreOptions = CreateStoreHooksOptions;
/** @deprecated Renamed to `UseWindowResult`. Removed in 1.0. */
export type UseOpenedWindow<Out extends MessageMap, In extends MessageMap, R> = UseWindowResult<
  Out,
  In,
  R
>;
