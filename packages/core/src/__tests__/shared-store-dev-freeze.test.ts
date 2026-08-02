import { describe, expect, it, vi } from 'vitest';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

// In development (NODE_ENV !== 'production', which the test env satisfies) values
// entering a store are deep-frozen, so an accidental in-place mutation throws at
// the offending line instead of silently failing to sync. See dev-freeze.ts.
describe('dev-mode value freezing', () => {
  it('deep-freezes an initial value, including nested objects and arrays', () => {
    const store = createSharedStore('freeze-initial', {
      profile: { name: 'ada', tags: ['a', 'b'], avatar: null }, // null exercises the null-branch
    });
    const { profile } = store.getSnapshot();
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.tags)).toBe(true); // recursion reached the array
  });

  it('makes the nested-mutation footgun throw instead of silently not syncing', () => {
    const store = createSharedStore('freeze-mutate', { obj: { n: 1 } });
    // Reading the value and mutating it in place — the classic bug.
    expect(() => {
      (store.getSnapshot().obj as { n: number }).n = 2;
    }).toThrow(TypeError);
    // Same story through the core `state` proxy escape hatch: the shallow trap
    // never sees a nested write, so freezing is the only thing that catches it.
    expect(() => {
      (store.state.obj as { n: number }).n = 3;
    }).toThrow(TypeError);
  });

  it('freezes a value written with set()', () => {
    const store = createSharedStore<{ data: { items: number[] } }>('freeze-set', {
      data: { items: [] },
    });
    store.set('data', { items: [1, 2] });
    expect(Object.isFrozen(store.getSnapshot().data)).toBe(true);
    expect(Object.isFrozen(store.getSnapshot().data.items)).toBe(true);
  });

  it('freezes a value that arrives from another tab', async () => {
    const hub = new MemoryHub();
    const a = createSharedStore<{ v: { x: number } }>(
      'freeze-remote',
      { v: { x: 0 } },
      { transport: () => hub.connect() },
    );
    const b = createSharedStore<{ v: { x: number } }>(
      'freeze-remote',
      { v: { x: 0 } },
      { transport: () => hub.connect() },
    );
    a.set('v', { x: 9 });
    await tick();
    expect(b.getSnapshot().v.x).toBe(9);
    expect(Object.isFrozen(b.getSnapshot().v)).toBe(true); // applyRemote froze it
  });

  it('passes typed arrays through unfrozen — freezing a non-empty view throws in every engine', () => {
    // Typed arrays are documented as shareable; the dev guard must not crash
    // dev builds on a production-legal value.
    const store = createSharedStore<{ buf: Uint8Array }>('freeze-typed-array', {
      buf: new Uint8Array([1, 2, 3]),
    });
    store.set('buf', new Uint8Array([4, 5]));
    expect([...store.getSnapshot().buf]).toEqual([4, 5]);
    expect(Object.isFrozen(store.getSnapshot().buf)).toBe(false);
  });

  it('freezes the objects held by Maps and Sets, though their entry lists stay mutable', () => {
    const held = { n: 1 };
    const keyObj = { k: 1 };
    const store = createSharedStore('freeze-collections', {
      map: new Map([[keyObj, held]]),
      set: new Set([held]),
    });

    // The contents are shared objects like any other: in-place edits throw.
    expect(() => {
      held.n = 2;
    }).toThrow(TypeError);
    expect(() => {
      keyObj.k = 2;
    }).toThrow(TypeError);
    // Documented gap: freezing a Map cannot lock map.set()/set.add().
    const map = store.getSnapshot().map as Map<unknown, unknown>;
    expect(() => map.set('later', 1)).not.toThrow();
  });

  it('freezes lazily registered initial values like every other entry path', () => {
    const store = createSharedStore<{ row?: { n: number } }>('freeze-register', {});
    const initial = { n: 1 };
    store.registerKey('row', initial);
    expect(Object.isFrozen(store.getSnapshot().row)).toBe(true);
    expect(() => {
      initial.n = 2;
    }).toThrow(TypeError);
  });

  it('terminates on a reference cycle rather than recursing forever', () => {
    const cyclic: Record<string, unknown> = { n: 1 };
    cyclic.self = cyclic;
    const store = createSharedStore('freeze-cycle', { cyclic });
    expect(Object.isFrozen(store.getSnapshot().cyclic)).toBe(true);
  });

  it('leaves primitive values alone', () => {
    const store = createSharedStore('freeze-primitive', { count: 0, note: 'hi' });
    store.set('count', 5);
    expect(store.getSnapshot().count).toBe(5); // no throw, nothing to freeze
  });

  it('is a no-op in production — the guard strips entirely', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    try {
      const { freezeShared } = await import('../dev-freeze.js');
      const obj = { n: 1 };
      expect(freezeShared(obj)).toBe(obj);
      expect(Object.isFrozen(obj)).toBe(false); // untouched in production
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
