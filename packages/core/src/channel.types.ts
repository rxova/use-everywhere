import type { CommonOptions, MessageMap, MessageMeta } from './common.types.js';
import type { SchemaOptions } from './schema.types.js';

export interface ChannelOptions<M extends MessageMap> extends CommonOptions, SchemaOptions<M> {}

export interface Channel<M extends MessageMap> {
  readonly name: string;
  readonly clientId: string;
  /** Fire-and-forget to every other tab/window/worker on this origin. Not echoed to self. */
  post<K extends keyof M & string>(type: K, payload: M[K]): void;
  on<K extends keyof M & string>(
    type: K,
    handler: (payload: M[K], meta: MessageMeta) => void,
  ): () => void;
  close(): void;
}
