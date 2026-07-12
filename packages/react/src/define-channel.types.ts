import type { Channel, MessageMap, MessageMeta } from '@use-everywhere/core';

/** A channel bound to a name and message map: typed hooks with no per-call generics. */
export interface ChannelHooks<M extends MessageMap> {
  /** The underlying channel instance (the same one the hooks use) — for non-React code. */
  get: () => Channel<M>;
  /** The channel's post function (stable identity). */
  useSend: () => Channel<M>['post'];
  /**
   * Subscribe to one message type. Same contract as the standalone
   * `useMessage`: the handler is kept fresh without resubscribing.
   */
  useMessage: <K extends keyof M & string>(
    type: K,
    handler: (payload: M[K], meta: MessageMeta) => void,
  ) => void;
}
