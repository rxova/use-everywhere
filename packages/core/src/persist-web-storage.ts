import type { Persisted, PersistAdapter } from './persist.types.js';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface WebStorageAdapterOptions {
  /**
   * Called when a storage operation fails: blocked storage, corrupt JSON, a
   * full quota. Persistence stays best-effort either way — this is the
   * observability seam (telemetry, a "your changes may not be saved" notice),
   * not a recovery path. Errors thrown by the callback itself are swallowed.
   */
  onError?: (error: unknown, operation: 'read' | 'write' | 'remove') => void;
}

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
 * to a silent no-op — persistence is best-effort; it must never break the
 * store. Pass `onError` to observe the failures anyway.
 */
export function webStorageAdapter(
  storage: StorageLike | (() => StorageLike | undefined),
  key: string,
  options: WebStorageAdapterOptions = {},
): PersistAdapter {
  const report = (error: unknown, operation: 'read' | 'write' | 'remove') => {
    try {
      options.onError?.(error, operation);
    } catch {
      // The observability seam must not become a new failure path.
    }
  };

  const resolve = (operation: 'read' | 'write' | 'remove'): StorageLike | undefined => {
    try {
      return typeof storage === 'function' ? storage() : storage;
    } catch (error) {
      report(error, operation);
      return undefined;
    }
  };

  return {
    read() {
      try {
        const raw = resolve('read')?.getItem(key);
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        return isPersisted(parsed) ? parsed : undefined;
      } catch (error) {
        report(error, 'read');
        return undefined;
      }
    },
    write(snapshot) {
      try {
        resolve('write')?.setItem(key, JSON.stringify(snapshot));
      } catch (error) {
        // Quota exceeded, or storage blocked.
        report(error, 'write');
      }
    },
    remove() {
      try {
        resolve('remove')?.removeItem(key);
      } catch (error) {
        report(error, 'remove');
      }
    },
  };
}

/** Survives closing every tab. */
export function localStorageAdapter(
  key: string,
  options?: WebStorageAdapterOptions,
): PersistAdapter {
  return webStorageAdapter(() => globalThis.localStorage, key, options);
}

/** Survives reloads, but dies with the tab. */
export function sessionStorageAdapter(
  key: string,
  options?: WebStorageAdapterOptions,
): PersistAdapter {
  return webStorageAdapter(() => globalThis.sessionStorage, key, options);
}
