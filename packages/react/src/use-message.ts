import { useEffect, useRef } from 'react';
import type { Channel, MessageMap, MessageMeta } from '@use-everywhere/core';
import { getChannel } from './registry.js';

/** Get the page-wide typed channel for `name` (one instance per name). */
export function useChannel<M extends MessageMap>(name: string): Channel<M> {
  return getChannel<M>(name);
}

/**
 * Subscribe to one message type. The handler is kept fresh without
 * resubscribing, so it may close over render state.
 */
export function useMessage<M extends MessageMap, K extends keyof M & string>(
  channel: Channel<M>,
  type: K,
  handler: (payload: M[K], meta: MessageMeta) => void,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(
    () => channel.on(type, (payload, meta) => handlerRef.current(payload, meta)),
    [channel, type],
  );
}

/** The channel's post function (stable identity per channel). */
export function useSend<M extends MessageMap>(channel: Channel<M>): Channel<M>['post'] {
  return channel.post;
}
