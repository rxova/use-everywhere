import { useEffect, useRef } from 'react';
import type { Channel, MessageMap, MessageMeta, ReplyMap } from '@use-everywhere/core';
import { getChannel } from './registry.js';

/** Get the page-wide typed channel for `name` (one instance per name). */
export function useChannel<M extends MessageMap, R extends ReplyMap<M> = Record<never, never>>(
  name: string,
): Channel<M, R> {
  return getChannel<M, R>(name);
}

export interface UseMessageOptions {
  /**
   * Subscribe at all. Default true.
   *
   * `false` unsubscribes rather than filtering inside the handler, so a
   * component that is not interested costs nothing — and the alternative,
   * calling the hook conditionally, is not allowed.
   */
  enabled?: boolean;
  /** Unsubscribe after the first message. */
  once?: boolean;
}

/**
 * Subscribe to one message type. The handler is kept fresh without
 * resubscribing, so it may close over render state.
 */
export function useMessage<M extends MessageMap, R extends ReplyMap<M>, K extends keyof M & string>(
  channel: Channel<M, R>,
  type: K,
  handler: (payload: M[K], meta: MessageMeta) => void,
  options?: UseMessageOptions,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const enabled = options?.enabled ?? true;
  const once = options?.once ?? false;
  useEffect(() => {
    if (!enabled) return;
    return channel.on(type, (payload, meta) => handlerRef.current(payload, meta), { once });
  }, [channel, type, enabled, once]);
}

/**
 * Answer `ask`s of one type for as long as this component is mounted.
 *
 * A hook rather than a bare `channel.answer` call because a responder is a
 * subscription: registering one in a render would leave the last unmounted
 * component answering for the page.
 *
 * One responder per type per channel — registering a second replaces the first,
 * which is the same first-wins-then-replace rule `answer` has in core.
 */
export function useAnswer<
  M extends MessageMap,
  R extends ReplyMap<M>,
  K extends keyof M & keyof R & string,
>(
  channel: Channel<M, R>,
  type: K,
  responder: (payload: M[K], meta: MessageMeta) => R[K],
  options?: { enabled?: boolean },
): void {
  const responderRef = useRef(responder);
  useEffect(() => {
    responderRef.current = responder;
  });
  const enabled = options?.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    return channel.answer(type, (payload, meta) => responderRef.current(payload, meta));
  }, [channel, type, enabled]);
}

/** The channel's post function (stable identity per channel). */
export function useSend<M extends MessageMap, R extends ReplyMap<M>>(
  channel: Channel<M, R>,
): Channel<M, R>['post'] {
  return channel.post;
}

/** The channel's ask function (stable identity per channel). */
export function useAsk<M extends MessageMap, R extends ReplyMap<M>>(
  channel: Channel<M, R>,
): Channel<M, R>['ask'] {
  return channel.ask;
}
