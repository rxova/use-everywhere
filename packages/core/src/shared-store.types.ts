import type { CommonOptions, MessageMeta, Version } from './common.types.js';
import type { PersistOptions } from './persist.types.js';
import type { SchemaOptions } from './schema.types.js';

export interface SharedStoreOptions<S = Record<string, unknown>>
  extends CommonOptions, SchemaOptions<S> {
  /**
   * Gatekeeper for incoming remote writes (patches and snapshot merges):
   * return false to ignore them. Lets callers delimit how much is shared —
   * e.g. accept only writes from other tabs, not from workers.
   */
  accept?: (meta: MessageMeta) => boolean;
  /** Restore this store on creation and write it back as it changes. */
  persist?: PersistOptions;
}

export interface SharedStore<S extends Record<string, unknown>> {
  readonly clientId: string;
  /**
   * Resolves once persisted state has been restored — or refused, or found
   * absent. Already resolved when there is no `persist` option at all.
   *
   * Exists because an async adapter cannot hydrate before the store is handed
   * back, and until now that gap was *unobservable*: a keystroke landing in it
   * writes at counter 1, the restore arrives holding counter 5, and
   * last-writer-wins correctly discards the newer keystroke. The behaviour is
   * right and the surprise is total. Gate first paint or first input on this
   * and the gap closes:
   *
   * ```ts
   * await store.hydrated;
   * ```
   *
   * Never rejects. A refused restore is reported through
   * `persist.onRestoreError` and still settles, because a store that kept its
   * initial values is usable and a promise nobody can await is not.
   */
  readonly hydrated: Promise<void>;
  /** Live proxy for imperative use: `store.state.count++` syncs everywhere. */
  readonly state: S;
  /** Immutable snapshot, replaced whenever a change is applied. Safe for useSyncExternalStore. */
  getSnapshot(): Readonly<S>;
  /** The per-key version clocks behind the snapshot. Referentially stable, like getSnapshot. */
  getVersions(): Readonly<Record<string, Version>>;
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
