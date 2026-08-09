// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import type { Persisted } from '../persist.types.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { snapshotWindow, tick } from './helpers/tick.js';

/**
 * Store behaviour nothing was checking, found by the mutation run: the wires it
 * refuses, the bookkeeping around close, and the lifecycle listeners.
 */
type Shape = Record<string, unknown>;
let n = 0;
const uniqueName = () => `sc-${++n}`;

const build = (hub: MemoryHub, name: string, initial: Shape = { a: 0 }, extra = {}) =>
  createSharedStore<Shape>(name, initial, { transport: () => hub.connect(), ...extra });

describe('wires the store refuses', () => {
  it('ignores every scope but its own', async () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());
    let changes = 0;
    store.subscribe(() => changes++);

    for (const scope of ['presence', 'leader', 'event'] as const) {
      hub.connect().post({
        v: 1,
        scope,
        type: 'patch',
        key: 'a',
        value: 99,
        version: [9, 'x'],
        clientId: 'x',
        kind: 'tab',
        ...(scope === 'event' ? { payload: null, msgId: 'm' } : {}),
      } as unknown as BusWire);
    }
    await tick();

    expect(changes).toBe(0);
    expect(store.getSnapshot().a).toBe(0);
    store.close();
  });

  it('drops a patch whose key is not a string', async () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());

    hub.connect().post({
      v: 1,
      scope: 'state',
      type: 'patch',
      key: 42,
      value: 99,
      version: [9, 'x'],
      clientId: 'x',
      kind: 'tab',
    } as unknown as BusWire);
    await tick();

    expect(store.getSnapshot().a).toBe(0);
    expect(Object.keys(store.getSnapshot())).toEqual(['a']);
    store.close();
  });

  it('drops a snapshot whose versions map is a primitive', async () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());

    hub.connect().post({
      v: 1,
      scope: 'state',
      type: 'snapshot',
      state: { a: 99 },
      versions: 'nope',
      clientId: 'x',
      kind: 'tab',
    } as unknown as BusWire);
    await tick();

    expect(store.getSnapshot().a).toBe(0);
    store.close();
  });
});

describe('subscription bookkeeping', () => {
  it('forgets a key once its last per-key subscriber goes', () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());
    let calls = 0;
    const first = store.subscribeKey('a', () => calls++);
    const second = store.subscribeKey('a', () => calls++);

    store.set('a', 1);
    expect(calls).toBe(2);

    first();
    second();
    store.set('a', 2);

    // Both gone: nothing should be called, and the empty set should not be
    // left behind growing the map for every key ever watched.
    expect(calls).toBe(2);
    store.close();
  });

  it('keeps notifying while one per-key subscriber remains', () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());
    let calls = 0;
    const first = store.subscribeKey('a', () => calls++);
    store.subscribeKey('a', () => calls++);

    first();
    store.set('a', 1);

    expect(calls).toBe(1);
    store.close();
  });
});

describe('close', () => {
  it('is idempotent and stops delivering', async () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());
    let changes = 0;
    store.subscribe(() => changes++);

    store.close();
    store.close();

    hub.connect().post({
      v: 1,
      scope: 'state',
      type: 'patch',
      key: 'a',
      value: 99,
      version: [9, 'x'],
      clientId: 'x',
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    expect(changes).toBe(0);
    store.close();
  });

  it('warns about a second store on one name, and stops once the first closes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const name = uniqueName();
    const first = createSharedStore<Shape>(name, { a: 0 });
    const second = createSharedStore<Shape>(name, { a: 0 });
    expect(warn).toHaveBeenCalledTimes(1);

    // Closing both must take the live count back to zero, or the next store on
    // this name is warned about for a store that no longer exists.
    first.close();
    second.close();
    warn.mockClear();

    const later = createSharedStore<Shape>(name, { a: 0 });
    expect(warn).not.toHaveBeenCalled();

    later.close();
    warn.mockRestore();
  });

  it('gives the name back when the last store on it closes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const name = uniqueName();

    const first = createSharedStore<Shape>(name, { a: 0 });
    first.close();
    const second = createSharedStore<Shape>(name, { a: 0 });

    // Sequential stores on one name are not duplicates. This is the only place
    // the decrement itself is observable — the warning is deduplicated per
    // message, so once a name has warned it never warns again — and a close
    // that skipped it, or moved the count the wrong way, would leave every
    // later store on this name looking like a second live one.
    expect(warn).not.toHaveBeenCalled();

    second.close();
    warn.mockRestore();
  });

  it('leaves the count alone for a store on its own transport', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const name = uniqueName();

    const shared = createSharedStore<Shape>(name, { a: 0 });
    // Not counted when it was created — a custom transport is a simulated tab,
    // not a second store on this page — so it must not discount on the way out
    // either, or a test double would cancel the warning for a page that really
    // is paying for two.
    build(hub, name).close();
    const second = createSharedStore<Shape>(name, { a: 0 });

    expect(warn).toHaveBeenCalledTimes(1);

    shared.close();
    second.close();
    warn.mockRestore();
  });

  it('stops answering lifecycle events', async () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());
    store.set('a', 1);
    await snapshotWindow();
    store.close();

    const seen: BusWire[] = [];
    const wire = hub.connect();
    wire.subscribe((data) => seen.push(data as BusWire));

    const restored = new Event('pageshow') as Event & { persisted?: boolean };
    restored.persisted = true;
    dispatchEvent(restored);
    await tick();

    expect(seen).toHaveLength(0);
    wire.close();
  });

  it('re-runs the late-joiner handshake on a bfcache restore, and not otherwise', async () => {
    const hub = new MemoryHub();
    const store = build(hub, uniqueName());
    await tick();
    const seen: BusWire[] = [];
    const wire = hub.connect();
    wire.subscribe((data) => seen.push(data as BusWire));

    const ordinary = new Event('pageshow') as Event & { persisted?: boolean };
    ordinary.persisted = false;
    dispatchEvent(ordinary);
    await tick();
    expect(seen.filter((w) => w.scope === 'state' && w.type === 'hello')).toHaveLength(0);

    const restored = new Event('pageshow') as Event & { persisted?: boolean };
    restored.persisted = true;
    dispatchEvent(restored);
    await tick();
    expect(seen.filter((w) => w.scope === 'state' && w.type === 'hello')).toHaveLength(1);

    store.close();
    wire.close();
  });
});

describe('a restore it refuses', () => {
  it('says which schema it found and which one it wanted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const store = build(
      hub,
      uniqueName(),
      { a: 0 },
      {
        persist: {
          adapter: {
            read: () =>
              ({ v: 1, schema: 9, state: { a: 1 }, versions: { a: [1, 'x'] } }) as Persisted,
            write: () => {},
          },
          version: 2,
        },
      },
    );

    // The code is what somebody pastes into a search box; the two versions are
    // the whole diagnosis — disk was written by a build ahead of this one, so
    // the store stayed on its initial values rather than guess at the shape.
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('UE1002');
    expect(line).toContain('v9');
    expect(line).toContain('expected v2');
    expect(store.getSnapshot().a).toBe(0);

    store.close();
    warn.mockRestore();
  });
});

describe('persistence timing', () => {
  it('coalesces a burst of writes into one disk write', async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const writes: Persisted[] = [];
    const store = build(
      hub,
      uniqueName(),
      { a: 0 },
      {
        persist: {
          adapter: { read: () => undefined, write: (s: Persisted) => void writes.push(s) },
          debounceMs: 50,
        },
      },
    );

    store.set('a', 1);
    store.set('a', 2);
    store.set('a', 3);
    expect(writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(60);

    // One timer for the burst, not one per write: the debounce is the whole
    // point, and a re-armed timer per write would write three times.
    expect(writes).toHaveLength(1);
    expect(writes[0]?.state.a).toBe(3);

    store.close();
    vi.useRealTimers();
  });

  it('flushes what it has on pagehide', async () => {
    const hub = new MemoryHub();
    const writes: Persisted[] = [];
    const store = build(
      hub,
      uniqueName(),
      { a: 0 },
      {
        persist: {
          adapter: { read: () => undefined, write: (s: Persisted) => void writes.push(s) },
          debounceMs: 10_000,
        },
      },
    );
    store.set('a', 7);

    dispatchEvent(new Event('pagehide'));

    // Long debounce, so only the pagehide flush can have produced this.
    expect(writes).toHaveLength(1);
    expect(writes[0]?.state.a).toBe(7);

    store.close();
  });
});
