import type { Persisted, PersistAdapter } from './persist.types.js';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isPersisted(value: unknown): value is Persisted {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Persisted>;
  return (
    candidate.v === 1 &&
    typeof candidate.state === 'object' &&
    typeof candidate.versions === 'object'
  );
}

/**
 * Persist to any Storage-shaped thing.
 *
 * `storage` may be a thunk, and that is the form the built-in adapters use:
 * merely *reading* `globalThis.localStorage` throws SecurityError when storage
 * is blocked (a sandboxed iframe, third-party cookies off), so evaluating it at
 * module scope would blow up on import — before any try/catch here could help.
 * Behind a thunk, every access happens inside one.
 *
 * Blocked storage, corrupt JSON, a foreign schema, or a full quota all degrade
 * to a silent no-op. Persistence is best-effort; it must never break the store.
 */
export function webStorageAdapter(
  storage: StorageLike | (() => StorageLike | undefined),
  key: string,
): PersistAdapter {
  const resolve = (): StorageLike | undefined => {
    try {
      return typeof storage === 'function' ? storage() : storage;
    } catch {
      return undefined;
    }
  };

  return {
    read() {
      try {
        const raw = resolve()?.getItem(key);
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        return isPersisted(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    },
    write(snapshot) {
      try {
        resolve()?.setItem(key, JSON.stringify(snapshot));
      } catch {
        // Quota exceeded, or storage blocked. Nothing useful to do.
      }
    },
    remove() {
      try {
        resolve()?.removeItem(key);
      } catch {
        // As above.
      }
    },
  };
}

/** Survives closing every tab. */
export function localStorageAdapter(key: string): PersistAdapter {
  return webStorageAdapter(() => globalThis.localStorage, key);
}

/** Survives reloads, but dies with the tab. */
export function sessionStorageAdapter(key: string): PersistAdapter {
  return webStorageAdapter(() => globalThis.sessionStorage, key);
}
