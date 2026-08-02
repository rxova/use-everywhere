import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BusWire } from '../bus.types.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

describe('non-cloneable writes are all-or-nothing', () => {
  it('rejects the write before touching local state, naming the key', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore<{ good?: unknown; bad?: unknown }>(
      'ws-clone',
      {},
      { transport: () => hub.connect() },
    );
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));
    const seen = vi.fn();
    store.subscribe(seen);

    // A function value is treated as an updater, so the classic mistake is a
    // non-cloneable *inside* the value: a callback smuggled into an object.
    expect(() => store.set('bad', { onDone: () => {} })).toThrow(/cannot cross the wire/);
    expect(() => store.set('bad', { onDone: () => {} })).toThrow(/"bad"/);

    // Nothing moved: no local write, no version burned, no listener woken,
    // nothing on the wire.
    expect(store.getSnapshot()).not.toHaveProperty('bad');
    expect(store.getVersions()).not.toHaveProperty('bad');
    expect(seen).not.toHaveBeenCalled();
    await tick();
    expect(heard.filter((w) => w.scope === 'state' && w.type === 'patch')).toHaveLength(0);

    // The key is unharmed: the next legal write starts at counter 1.
    store.set('bad', { fine: true });
    expect(store.getVersions().bad?.[0]).toBe(1);
    store.close();
    rogue.close();
  });

  it('throws through the state proxy escape hatch too', () => {
    const hub = new MemoryHub();
    const store = createSharedStore<{ cb?: unknown }>(
      'ws-clone-proxy',
      {},
      { transport: () => hub.connect() },
    );

    expect(() => {
      store.state.cb = { handler: () => {} };
    }).toThrow(/cannot cross the wire/);
    expect(store.getSnapshot()).not.toHaveProperty('cb');
    store.close();
  });
});

describe('two stores, one name, one tab', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns in dev — BroadcastChannel never echoes within a page, so they cannot sync', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = createSharedStore('ws-duplicate', { n: 0 });
    expect(warn).not.toHaveBeenCalled();

    const second = createSharedStore('ws-duplicate', { n: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('second shared store');

    // Closing one then the other keeps the live-count bookkeeping honest
    // (close is also idempotent — a double close must not underflow).
    first.close();
    first.close();
    second.close();
  });

  it('does not warn for simulated multi-tab stores on a custom transport', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const a = createSharedStore('ws-sim', { n: 0 }, { transport: () => hub.connect() });
    const b = createSharedStore('ws-sim', { n: 0 }, { transport: () => hub.connect() });

    expect(warn).not.toHaveBeenCalled();
    a.close();
    b.close();
  });
});
