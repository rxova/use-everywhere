import type { CommonOptions, MessageMap, MessageMeta } from './common.types.js';
import type { SchemaOptions } from './schema.types.js';

export interface ChannelOptions<M extends MessageMap> extends CommonOptions, SchemaOptions<M> {}

/**
 * What each message type answers with, for `ask`/`answer`.
 *
 * A separate map from the request types, and empty by default, so
 * request/response is opt-in and typed rather than `unknown` everywhere.
 *
 * ```ts
 * type Requests = { 'config:get': void };
 * type Replies = { 'config:get': { theme: string } };
 * const channel = createChannel<Requests, Replies>('app');
 * ```
 */
export type ReplyMap<M extends MessageMap> = Partial<Record<keyof M, unknown>>;

export interface PostOptions {
  /**
   * Also deliver to this client's own handlers.
   *
   * A post is not echoed by default, which matches `BroadcastChannel` and is
   * usually right. It is wrong for the case the README kept demonstrating: a
   * component that has to update local state *and* tell everyone else ends up
   * writing the same effect twice, in two places, which then drift.
   */
  echo?: boolean;
}

export interface OnOptions {
  /** Unsubscribe after the first message. The returned function is still safe to call. */
  once?: boolean;
}

export interface AskOptions {
  /** Give up after this long. Default 5000. */
  timeoutMs?: number;
}

export interface Channel<M extends MessageMap, R extends ReplyMap<M> = Record<never, never>> {
  readonly name: string;
  readonly clientId: string;
  /** Fire-and-forget to every other tab/window/worker on this origin. */
  post<K extends keyof M & string>(type: K, payload: M[K], options?: PostOptions): void;
  on<K extends keyof M & string>(
    type: K,
    handler: (payload: M[K], meta: MessageMeta) => void,
    options?: OnOptions,
  ): () => void;
  /**
   * Ask the origin a question and wait for the first answer.
   *
   * Rejects if nobody answers before the timeout — an unanswered question is a
   * fact worth having rather than a promise that hangs. If several clients
   * registered an `answer` for this type, the first reply to arrive wins and
   * the rest are dropped; gate the responder on leadership when you need the
   * answer to come from a particular tab.
   */
  ask<K extends keyof M & keyof R & string>(
    type: K,
    payload: M[K],
    options?: AskOptions,
  ): Promise<R[K]>;
  /** Answer `ask`s of this type. Returns an unsubscribe. */
  answer<K extends keyof M & keyof R & string>(
    type: K,
    responder: (payload: M[K], meta: MessageMeta) => R[K],
  ): () => void;
  close(): void;
}
