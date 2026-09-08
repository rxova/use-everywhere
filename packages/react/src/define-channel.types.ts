import type { Channel, MessageMap, MessageMeta } from '@use-everywhere/core';

/** A channel bound to a name and message map: typed hooks with no per-call generics. */
export interface ChannelHooks<M extends MessageMap> {
  /** The underlying channel instance (the same one the hooks use) — for non-React code. */
  get: () => Channel<M>;
  /** The channel's post function (stable identity). */
  useSend: () => Channel<M>['post'];
  /**
   * Subscribe to one message type. Same contract as the standalone
   * `useOnMessage`: the handler is kept fresh without resubscribing.
   */
  useOnMessage: <K extends keyof M & string>(
    type: K,
    handler: (payload: M[K], meta: MessageMeta) => void,
  ) => void;
  /** @deprecated Renamed to `useOnMessage`. Removed in 1.0 — `npx use-everywhere-codemod rename-1.0 src/`. */
  useMessage: <K extends keyof M & string>(
    type: K,
    handler: (payload: M[K], meta: MessageMeta) => void,
  ) => void;
}
