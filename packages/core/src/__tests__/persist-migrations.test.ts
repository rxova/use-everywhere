import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Persisted, RestoreError } from '../persist.types.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';

/**
 * Disk is where version skew has its longest fuse. A wire from another deploy is
 * gone in a second; a value written by last month's build sits there until
 * someone reopens the tab, and then restores with a clock that beats every live
 * tab. Before this there was no way to even notice.
 */
const savedAt = (schema: number | undefined, state: Record<string, unknown>): Persisted =>
  ({
    v: 1,
    ...(schema === undefined ? {} : { schema }),
    state,
    versions: Object.fromEntries(Object.keys(state).map((k) => [k, [9, 'old-deploy']])),
  }) as Persisted;

const adapterFor = (saved: Persisted | undefined) => {
  const writes: Persisted[] = [];
  return {
    writes,
    adapter: { read: () => saved, write: (s: Persisted) => void writes.push(s) },
  };
};

describe('persisted state at a different schema version', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is restored untouched when the version matches', () => {
    const hub = new MemoryHub();
    const { adapter } = adapterFor(savedAt(2, { theme: 'dark' }));
    const store = createSharedStore(
      'pm-match',
      { theme: 'light' },
      { transport: () => hub.connect(), persist: { adapter, version: 2 } },
    );

    expect(store.getSnapshot().theme).toBe('dark');
    store.close();
  });

  it('runs migrate when the version on disk is older, keeping the clocks', () => {
    const hub = new MemoryHub();
    const { adapter } = adapterFor(savedAt(1, { name: 'ada' }));
    const store = createSharedStore(
      'pm-older',
      { name: '', greeting: '' },
      {
        transport: () => hub.connect(),
        persist: {
          adapter,
          version: 2,
          migrate: (state, from) => ({
            ...state,
            greeting: `hello ${String(state.name)} (v${from})`,
          }),
        },
      },
    );

    expect(store.getSnapshot().greeting).toBe('hello ada (v1)');
    // The migrated value keeps the persisted clock, so it re-enters the
    // last-writer-wins order where the original left it rather than at zero.
    expect(store.getVersions().name).toEqual([9, 'old-deploy']);
    store.close();
  });

  it('mints a clock for a key the migration added', () => {
    const hub = new MemoryHub();
    const { adapter } = adapterFor(savedAt(1, { first: 'ada', last: 'lovelace' }));
    const store = createSharedStore(
      'pm-added-key',
      { first: '', last: '', fullName: '' },
      {
        transport: () => hub.connect(),
        persist: {
          adapter,
          version: 2,
          migrate: (state) => ({
            ...state,
            fullName: `${String(state.first)} ${String(state.last)}`,
          }),
        },
      },
    );

    // Deriving a new field is the commonest migration there is, and the key it
    // produces has no clock on disk because it did not exist when that file was
    // written. Without one minted here it would be silently dropped — the one
    // thing the migration existed to do.
    expect(store.getSnapshot().fullName).toBe('ada lovelace');
    expect(store.getVersions().fullName?.[0]).toBe(1);
    // Attributed to the tab that computed it, not to the deploy that wrote the file.
    expect(store.getVersions().fullName?.[1]).toBe(store.clientId);
    store.close();
  });

  it('lets a live tab outrank a migrated value', async () => {
    const hub = new MemoryHub();
    const live = createSharedStore(
      'pm-live-wins',
      { derived: '' },
      { transport: () => hub.connect() },
    );
    live.set('derived', 'written just now');
    live.set('derived', 'and again');

    const { adapter } = adapterFor(savedAt(1, { other: 1 }));
    const restored = createSharedStore(
      'pm-live-wins',
      { derived: '', other: 0 },
      {
        transport: () => hub.connect(),
        persist: {
          adapter,
          version: 2,
          migrate: (state) => ({ ...state, derived: 'from a migration' }),
        },
      },
    );
    // Past the jittered snapshot window, which is how the restored tab hears
    // the live tab's newer value.
    await new Promise((r) => setTimeout(r, 80));

    // A minted [1, …] is a real write, but live data outranks a migration of
    // stale disk — the live tab is on counter 2.
    expect(restored.getSnapshot().derived).toBe('and again');

    live.close();
    restored.close();
  });

  it('treats state written before versioning existed as version 0', () => {
    const hub = new MemoryHub();
    const { adapter } = adapterFor(savedAt(undefined, { name: 'ada' }));
    const seen: number[] = [];
    const store = createSharedStore(
      'pm-legacy',
      { name: '' },
      {
        transport: () => hub.connect(),
        persist: {
          adapter,
          version: 1,
          migrate: (state, from) => {
            seen.push(from);
            return state;
          },
        },
      },
    );

    // Adopting versioning has to work on data that predates it, or the first
    // release with a `version` throws away everybody's state.
    expect(seen).toEqual([0]);
    expect(store.getSnapshot().name).toBe('ada');
    store.close();
  });

  it('refuses state written by a newer build rather than guessing', () => {
    const hub = new MemoryHub();
    const errors: RestoreError[] = [];
    const { adapter } = adapterFor(savedAt(5, { theme: 'dark' }));
    const store = createSharedStore(
      'pm-ahead',
      { theme: 'light' },
      {
        transport: () => hub.connect(),
        persist: { adapter, version: 2, onRestoreError: (e) => errors.push(e) },
      },
    );

    // A build cannot be asked to understand a shape that postdates it, and
    // guessing would put values it misreads back on the wire with winning
    // clocks. Same call the envelope makes for an unknown protocol version.
    expect(store.getSnapshot().theme).toBe('light');
    expect(errors).toEqual([{ reason: 'ahead', found: 5, expected: 2 }]);
    store.close();
  });

  it('refuses older state when there is no migrate to carry it forward', () => {
    const hub = new MemoryHub();
    const errors: RestoreError[] = [];
    const { adapter } = adapterFor(savedAt(1, { theme: 'dark' }));
    const store = createSharedStore(
      'pm-no-migrate',
      { theme: 'light' },
      {
        transport: () => hub.connect(),
        persist: { adapter, version: 2, onRestoreError: (e) => errors.push(e) },
      },
    );

    expect(store.getSnapshot().theme).toBe('light');
    expect(errors[0]?.reason).toBe('no-migrate');
    store.close();
  });

  it('survives a migrate that throws', () => {
    const hub = new MemoryHub();
    const errors: RestoreError[] = [];
    const { adapter } = adapterFor(savedAt(1, { theme: 'dark' }));
    const store = createSharedStore(
      'pm-throws',
      { theme: 'light' },
      {
        transport: () => hub.connect(),
        persist: {
          adapter,
          version: 2,
          migrate: () => {
            throw new Error('bad migration');
          },
          onRestoreError: (e) => errors.push(e),
        },
      },
    );

    // A throwing migration is a bug in the migration. The one thing it must not
    // do is take the store down on every page load.
    expect(store.getSnapshot().theme).toBe('light');
    expect(errors[0]?.reason).toBe('migrate-threw');
    expect((errors[0]?.cause as Error).message).toBe('bad migration');
    store.set('theme', 'blue');
    expect(store.getSnapshot().theme).toBe('blue');
    store.close();
  });

  it('warns in development when nothing is observing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const { adapter } = adapterFor(savedAt(9, { theme: 'dark' }));
    const store = createSharedStore(
      'pm-warn',
      { theme: 'light' },
      { transport: () => hub.connect(), persist: { adapter, version: 2 } },
    );

    expect(warn.mock.calls[0]?.[0]).toContain('schema v9');
    store.close();
  });

  it('stamps the current version on what it writes', () => {
    const hub = new MemoryHub();
    const { adapter, writes } = adapterFor(undefined);
    const store = createSharedStore(
      'pm-stamp',
      { theme: 'light' },
      { transport: () => hub.connect(), persist: { adapter, version: 3, debounceMs: 0 } },
    );

    store.set('theme', 'dark');
    store.close(); // flushes

    expect(writes[writes.length - 1]?.schema).toBe(3);
    // Absent `version` still writes 0, so the field is always present and a
    // later build can tell "no version" from "version 0" by its own config
    // rather than by the file.
    expect(writes[writes.length - 1]?.state.theme).toBe('dark');
  });
});

describe('store.hydrated', () => {
  it('is already resolved when there is no persistence', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore('hy-none', { a: 1 }, { transport: () => hub.connect() });

    await expect(store.hydrated).resolves.toBeUndefined();
    store.close();
  });

  it('closes the async-adapter gap that last-writer-wins makes invisible', async () => {
    const hub = new MemoryHub();
    const saved = savedAt(0, { draft: 'from disk' });
    const store = createSharedStore(
      'hy-async',
      { draft: '' },
      {
        transport: () => hub.connect(),
        persist: { adapter: { read: () => Promise.resolve(saved), write: () => {} } },
      },
    );

    // The gap: a keystroke here writes at counter 1, the restore arrives holding
    // counter 9, and LWW correctly discards the newer keystroke. The behaviour
    // is right and the surprise is total — which is what `hydrated` is for.
    store.set('draft', 'typed before hydration');
    expect(store.getSnapshot().draft).toBe('typed before hydration');

    await store.hydrated;
    expect(store.getSnapshot().draft).toBe('from disk');

    store.close();
  });

  it('settles even when the restore is refused', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore(
      'hy-refused',
      { a: 1 },
      {
        transport: () => hub.connect(),
        persist: {
          adapter: { read: () => savedAt(7, { a: 2 }), write: () => {} },
          version: 1,
          onRestoreError: () => {},
        },
      },
    );

    // A store that kept its initial values is usable; a promise nobody can
    // await is not.
    await expect(store.hydrated).resolves.toBeUndefined();
    expect(store.getSnapshot().a).toBe(1);
    store.close();
  });

  it('settles when there was nothing saved at all', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore(
      'hy-empty',
      { a: 1 },
      {
        transport: () => hub.connect(),
        persist: { adapter: { read: () => undefined, write: () => {} } },
      },
    );

    await expect(store.hydrated).resolves.toBeUndefined();
    store.close();
  });
});
