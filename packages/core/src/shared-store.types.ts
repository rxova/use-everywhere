import type { CommonOptions, MessageMeta } from './common.types.js';

export interface SharedStoreOptions extends CommonOptions {
  /**
   * Gatekeeper for incoming remote writes (patches and snapshot merges):
   * return false to ignore them. Lets callers delimit how much is shared —
   * e.g. accept only writes from other tabs, not from workers.
   */
  accept?: (meta: MessageMeta) => boolean;
}

export interface SharedStore<S extends Record<string, unknown>> {
  readonly clientId: string;
  /** Live proxy for imperative use: `store.state.count++` syncs everywhere. */
  readonly state: S;
  /** Immutable snapshot, replaced whenever a change is applied. Safe for useSyncExternalStore. */
  getSnapshot(): Readonly<S>;
  set<K extends keyof S & string>(key: K, value: S[K] | ((prev: S[K]) => S[K])): void;
  subscribe(fn: (key: keyof S & string, value: unknown, meta: MessageMeta) => void): () => void;
  subscribeKey(key: keyof S & string, fn: () => void): () => void;
  /**
   * Register a key lazily at version [0, clientId] — any patch or snapshot a
   * peer has already made for it wins over the initial value. No-op if the
   * key already exists.
   */
  registerKey<K extends keyof S & string>(key: K, initial: S[K]): void;
  close(): void;
}
