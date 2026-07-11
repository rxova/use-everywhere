import type { MessageMap, MessageMeta } from './common.types.js';

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
