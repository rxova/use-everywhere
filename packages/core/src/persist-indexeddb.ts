import type { Persisted, PersistAdapter } from './persist.types.js';

export interface IndexedDbAdapterOptions {
  /** Database name. Default 'use-everywhere'. */
  database?: string;
  /**
   * Called when an operation fails: blocked storage, a version conflict, a
   * quota. Persistence stays best-effort either way — this is the
   * observability seam, not a recovery path.
   */
  onError?: (error: unknown, operation: 'read' | 'write' | 'remove') => void;
}

const STORE = 'state';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Persist to IndexedDB.
 *
 * Two things this has that `localStorage` does not.
 *
 * **Real fidelity, with no serializer.** IndexedDB stores values with the
 * structured clone algorithm — the same one `BroadcastChannel` uses — so a
 * `Date` comes back a `Date` and a `Map` a `Map`, for free. The whole
 * JSON-degrades-your-types problem the {@link Serializer} seam exists to solve
 * simply is not present here, and passing a serializer would only reintroduce
 * it. That makes this the right home for state that is not JSON-shaped.
 *
 * **Room.** `localStorage` is a few megabytes per origin and shared with
 * everything else on it; IndexedDB is orders of magnitude larger.
 *
 * And one thing it does not have.
 *
 * **A synchronous flush.** `read` is asynchronous, so the store is handed back
 * before its state arrives — which is exactly the window `store.hydrated` and
 * `useHydrated` exist to close. Gate first input on one of them, or a keystroke
 * landing in that window is discarded by last-writer-wins when the restore
 * lands holding an older but higher-counter value.
 *
 * The same asymmetry applies on the way out: a `pagehide` flush cannot be
 * awaited, so the last debounced write before a tab closes may not land. The
 * debounce (`persist.debounceMs`, default 100) is the real protection — keep it
 * short for state you would mind losing, or keep that state in
 * `localStorageAdapter`, which writes synchronously, and the bulk here.
 */
export function indexedDbAdapter(
  key: string,
  options: IndexedDbAdapterOptions = {},
): PersistAdapter {
  const database = options.database ?? 'use-everywhere';
  let open: Promise<IDBDatabase> | undefined;

  const report = (error: unknown, operation: 'read' | 'write' | 'remove') => {
    try {
      options.onError?.(error, operation);
    } catch {
      // An onError that throws must not become the failure it was reporting.
    }
  };

  /**
   * Opened lazily and once. Merely naming `indexedDB` is safe, but opening it
   * throws in a sandboxed iframe and in some private modes, so every access
   * lives inside a rejection path rather than at module scope.
   */
  const db = (): Promise<IDBDatabase> =>
    (open ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(database, 1);
      // Fires only when this database is being created, since the version is
      // fixed at 1 — so the store never already exists and needs no guard.
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      // Another tab holding an older version open blocks the upgrade. Failing
      // here beats hanging forever on a promise nothing will settle.
      req.onblocked = () => reject(new Error('use-everywhere: IndexedDB upgrade blocked'));
    }));

  const transact = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const connection = await db();
    return request(run(connection.transaction(STORE, mode).objectStore(STORE)));
  };

  return {
    async read() {
      try {
        return (await transact('readonly', (store) => store.get(key))) as Persisted | undefined;
      } catch (error) {
        // Best-effort: a store that cannot restore is still a working store.
        report(error, 'read');
        return undefined;
      }
    },
    async write(snapshot) {
      try {
        await transact('readwrite', (store) => store.put(snapshot, key));
      } catch (error) {
        report(error, 'write');
      }
    },
    async remove() {
      try {
        await transact('readwrite', (store) => store.delete(key));
      } catch (error) {
        report(error, 'remove');
      }
    },
  };
}
