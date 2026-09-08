import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersistAdapter, Persisted, StorageLike } from '@use-everywhere/core';
import { webStorageAdapter } from '@use-everywhere/core';
import { createStoreHooks } from '../create-store-hooks.js';
import { getSharedStore } from '../registry.js';
import { useSharedState } from '../use-shared-state.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const storage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

// Registry singletons live for the page, so every test needs its own name.
let n = 0;
const uniqueName = () => `ds-${++n}`;

describe('createStoreHooks', () => {
  it('restores a persisted value on first paint, with no flash of the initial', async () => {
    const name = uniqueName();
    const { storage } = fakeStorage({
      [name]: JSON.stringify({
        v: 1,
        state: { theme: 'dark' },
        versions: { theme: [3, 'old-tab'] },
      } satisfies Persisted),
    });

    const settings = createStoreHooks<{ theme: string }>(name, {
      persist: webStorageAdapter(storage, name),
    });

    function Theme() {
      const [theme] = settings.useSharedState('theme', 'light');
      return <span data-testid="theme">{theme}</span>;
    }

    render(<Theme />);

    // Synchronous adapter, so the restored value is there on the very first
    // render — the hook's 'light' initial never wins.
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('writes changes back to storage', async () => {
    const name = uniqueName();
    const { storage, map } = fakeStorage();
    const settings = createStoreHooks<{ count: number }>(name, {
      persist: webStorageAdapter(storage, name),
      persistDebounceMs: 10,
    });

    function Counter() {
      const [count, setCount] = settings.useSharedState('count', 0);
      return (
        <button data-testid="btn" onClick={() => setCount(count + 1)}>
          {count}
        </button>
      );
    }

    render(<Counter />);
    act(() => screen.getByTestId('btn').click());
    await act(() => new Promise<void>((r) => setTimeout(r, 30)));

    const written = JSON.parse(map.get(name) ?? '{}') as Persisted;
    expect(written.state).toEqual({ count: 1 });
  });

  it('resolves to the same store a bare useSharedState reaches, so both persist', async () => {
    const name = uniqueName();
    const { storage, map } = fakeStorage();
    const settings = createStoreHooks<{ a: string }>(name, {
      persist: webStorageAdapter(storage, name),
      persistDebounceMs: 10,
    });

    function Bare() {
      // Never touches the bound hooks — but it must land on the same store.
      const [, setValue] = useSharedState('a', 'x', { store: name });
      return <button data-testid="set" onClick={() => setValue('written-bare')} />;
    }

    render(<Bare />);
    act(() => screen.getByTestId('set').click());
    await act(() => new Promise<void>((r) => setTimeout(r, 30)));

    expect(settings.store()).toBe(getSharedStore(name));
    expect((JSON.parse(map.get(name) ?? '{}') as Persisted).state).toEqual({ a: 'written-bare' });
  });

  it('hands back the same singleton to non-React code', () => {
    const name = uniqueName();
    const settings = createStoreHooks(name);

    expect(settings.store()).toBe(settings.store());
    expect(settings.store()).toBe(getSharedStore(name));
  });

  it('works without persistence at all', async () => {
    const name = uniqueName();
    const plain = createStoreHooks<{ v: number }>(name);

    function Widget() {
      const [v] = plain.useSharedState('v', 7);
      return <span data-testid="v">{v}</span>;
    }
    render(<Widget />);
    await flush();

    expect(screen.getByTestId('v').textContent).toBe('7');
  });

  it('honours a scope', () => {
    const name = uniqueName();
    const scoped = createStoreHooks<{ v: number }>(name, { scope: 'tab' });

    // A different scope is a different store, even for the same name.
    expect(scoped.store()).not.toBe(getSharedStore(name, 'everywhere'));
    expect(scoped.store()).toBe(getSharedStore(name, 'tab'));
  });

  it('passes a keys filter through to the adapter', async () => {
    const name = uniqueName();
    const { storage, map } = fakeStorage();
    const store = createStoreHooks<{ keep: string; drop: string }>(name, {
      persist: webStorageAdapter(storage, name),
      persistKeys: ['keep'],
      persistDebounceMs: 10,
    });

    act(() => {
      store.store().set('keep', 'yes');
      store.store().set('drop', 'no');
    });
    await act(() => new Promise<void>((r) => setTimeout(r, 30)));

    expect((JSON.parse(map.get(name) ?? '{}') as Persisted).state).toEqual({ keep: 'yes' });
  });

  it('warns, without throwing, when it runs after the store already exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const name = uniqueName();
    const adapter: PersistAdapter = { read: () => undefined, write: () => {} };

    getSharedStore(name); // the store is now live

    // Silently handing back a store with no persistence is the ambiguity this
    // design exists to avoid, so it is still loud — but a warning rather than a
    // throw, because the same call is what Fast Refresh replays on every edit.
    expect(() => createStoreHooks(name, { persist: adapter })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/module scope/);
    warn.mockRestore();
  });

  it('re-registering an identical configuration is a no-op, so Fast Refresh does not break dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const name = uniqueName();
    const adapter: PersistAdapter = { read: () => undefined, write: () => {} };

    createStoreHooks(name, { persist: adapter, persistDebounceMs: 5 });
    getSharedStore(name); // the store is now live

    // What a hot edit of the defining module does: same shape, brand-new
    // adapter object. Comparing identity would call this a conflict.
    const reloaded: PersistAdapter = { read: () => undefined, write: () => {} };
    createStoreHooks(name, { persist: reloaded, persistDebounceMs: 5 });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns when a late redefinition actually differs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const name = uniqueName();
    const adapter: PersistAdapter = { read: () => undefined, write: () => {} };

    createStoreHooks(name, { persist: adapter, persistDebounceMs: 5 });
    getSharedStore(name);

    createStoreHooks(name, { persist: adapter, persistDebounceMs: 500 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/different options/);
    warn.mockRestore();
  });
});
