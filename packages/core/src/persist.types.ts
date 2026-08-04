import type { Version } from './common.types.js';

/**
 * What goes to disk. The version clocks travel *with* the values — that is the
 * whole point: a reopened tab re-enters the last-writer-wins race with its real
 * term instead of a fresh zero, so a restored value can legitimately beat, or
 * legitimately lose to, whatever the live tabs are holding.
 */
export interface Persisted {
  /**
   * The *envelope* version — the shape of this record, owned by the library.
   * Not to be confused with `schema`, which is the shape of your state and is
   * owned by you.
   */
  v: 1;
  /**
   * The app's state-shape version at the time of writing, from
   * {@link PersistOptions.version}. Absent on anything written before
   * versioning existed, which reads as 0.
   */
  schema?: number;
  state: Record<string, unknown>;
  versions: Record<string, Version>;
}

export interface PersistAdapter {
  /**
   * Prefer a synchronous read. An async adapter cannot hydrate before the store
   * is handed back, so a write made in that gap can be clobbered by the restore.
   */
  read(): Persisted | undefined | Promise<Persisted | undefined>;
  write(snapshot: Persisted): void | Promise<void>;
  remove?(): void | Promise<void>;
}

/** Why a restore was refused, for {@link PersistOptions.onRestoreError}. */
export interface RestoreError {
  /** `'ahead'` — written by a newer build; `'no-migrate'` — older, with no way forward; `'migrate-threw'`. */
  readonly reason: 'ahead' | 'no-migrate' | 'migrate-threw';
  /** The schema version on disk. */
  readonly found: number;
  /** The schema version this build expects. */
  readonly expected: number;
  /** Present only for `'migrate-threw'`. */
  readonly cause?: unknown;
}

export interface PersistOptions {
  adapter: PersistAdapter;
  /** Persist only these keys. Default: every key that has been written. */
  keys?: string[];
  /** Coalesce writes for this long. Default 100. */
  debounceMs?: number;
  /**
   * The version of *your* state's shape. Bump it whenever a key changes meaning
   * or type, and supply {@link migrate} to carry old data forward.
   *
   * Disk is where version skew has its longest fuse. A wire from another deploy
   * is gone in a second; a value written by last month's build sits there until
   * someone reopens the tab, and then restores with a clock that beats every
   * live tab. Without a version there is no way to even notice.
   *
   * Default 0, which is also what anything written before this existed reads as
   * — so adding `version: 1` and a `migrate` is enough to adopt it.
   */
  version?: number;
  /**
   * Bring persisted state written at an older `version` up to the current one.
   * Return the migrated state; the version clocks are carried over untouched,
   * so a migrated value keeps its place in the last-writer-wins order.
   *
   * Only called when `from` is *older*. Newer data — an older build reading what
   * a newer one wrote — is refused instead, because a build cannot be asked to
   * understand a shape that postdates it. That is the same call the wire makes
   * for a protocol version it does not know.
   */
  migrate?: (state: Record<string, unknown>, from: number) => Record<string, unknown>;
  /**
   * Called when persisted state is refused instead of restored. The store keeps
   * its initial values and carries on either way — this is how you find out,
   * and the default is a development warning.
   */
  onRestoreError?: (error: RestoreError) => void;
}
