import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Persisted, PersistAdapter } from '@use-everywhere/core';
import { createStoreHooks } from '../create-store-hooks.js';
import { useHydrated } from '../use-hydrated.js';
import { useSharedState } from '../use-shared-state.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

let n = 0;
const uniqueName = () => `hyd-${++n}`;

const saved = (state: Record<string, unknown>): Persisted => ({
  v: 1,
  state,
  versions: Object.fromEntries(
    Object.keys(state).map((k) => [k, [9, 'disk']]),
  ) as Persisted['versions'],
});

/** An adapter that hands its data back a task later, the way IndexedDB would. */
const asyncAdapter = (data: Persisted): PersistAdapter => ({
  read: () => Promise.resolve(data),
  write: () => {},
});

describe('useHydrated', () => {
  it('is false on the first render and true once the restore lands', async () => {
    const name = uniqueName();
    createStoreHooks(name, { persist: asyncAdapter(saved({ draft: 'from disk' })) });

    function App() {
      const ready = useHydrated({ store: name });
      const [draft] = useSharedState('draft', '', { store: name });
      return (
        <>
          <span data-testid="ready">{ready ? 'yes' : 'no'}</span>
          <span data-testid="draft">{draft}</span>
        </>
      );
    }
    render(<App />);
    // First render: the async read has not come back, and the store is on its
    // initial value. This is exactly the window a keystroke would be lost in.
    expect(screen.getByTestId('ready').textContent).toBe('no');
    expect(screen.getByTestId('draft').textContent).toBe('');

    await flush();

    expect(screen.getByTestId('ready').textContent).toBe('yes');
    expect(screen.getByTestId('draft').textContent).toBe('from disk');
  });

  it('does not set state on a component that unmounted while waiting', async () => {
    const name = uniqueName();
    createStoreHooks(name, { persist: asyncAdapter(saved({ draft: 'from disk' })) });

    function App() {
      const ready = useHydrated({ store: name });
      return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
    }
    const { unmount } = render(<App />);
    // Unmounted inside the window the async read is still open, which is the
    // whole point of the cancel flag: the promise resolves either way, and
    // without it React is handed a state update for a component that is gone.
    unmount();
    await flush();

    expect(screen.queryByTestId('ready')).toBeNull();
  });

  it('defaults to the default store when called bare', async () => {
    function App() {
      const ready = useHydrated();
      return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
    }
    render(<App />);
    await flush();

    expect(screen.getByTestId('ready').textContent).toBe('yes');
  });

  it('reads the store named by scope, not just by name', async () => {
    function App() {
      // A tab-scoped store is a different store from the everywhere-scoped one
      // of the same name, so the option has to reach getStore or this hook
      // would report on the wrong one.
      const ready = useHydrated({ store: uniqueName(), scope: 'tab' });
      return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
    }
    render(<App />);
    await flush();

    expect(screen.getByTestId('ready').textContent).toBe('yes');
  });

  it('settles for a store with no persistence at all', async () => {
    const name = uniqueName();
    function App() {
      const ready = useHydrated({ store: name });
      return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
    }
    render(<App />);
    await flush();

    // Nothing to restore is still hydrated — otherwise every non-persisted app
    // would sit behind a loading state that never clears.
    expect(screen.getByTestId('ready').textContent).toBe('yes');
  });

  it('starts false even for a synchronous adapter that has already finished', async () => {
    const name = uniqueName();
    createStoreHooks(name, {
      persist: { read: () => saved({ theme: 'dark' }), write: () => {} },
    });

    function App() {
      const ready = useHydrated({ store: name });
      const [theme] = useSharedState('theme', 'light', { store: name });
      return (
        <>
          <span data-testid="ready">{ready ? 'yes' : 'no'}</span>
          <span data-testid="theme">{theme}</span>
        </>
      );
    }
    render(<App />);

    // The value is already restored, and `ready` still starts false: a hook
    // that differed between the server render and the hydrating render would be
    // a mismatch in every app that used it.
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('ready').textContent).toBe('no');

    await flush();
    expect(screen.getByTestId('ready').textContent).toBe('yes');
  });
});

describe('createStoreHooks with a schema version', () => {
  it('migrates older persisted state', async () => {
    const name = uniqueName();
    const store = createStoreHooks<{ first: string; fullName: string }>(name, {
      persist: { read: () => ({ ...saved({ first: 'ada' }), schema: 1 }), write: () => {} },
      persistVersion: 2,
      migrate: (state) => ({ ...state, fullName: `${String(state.first)} lovelace` }),
    });

    function App() {
      const [fullName] = store.useSharedState('fullName', '');
      return <span data-testid="full">{fullName}</span>;
    }
    render(<App />);
    await flush();

    expect(screen.getByTestId('full').textContent).toBe('ada lovelace');
  });

  it('refuses state from a newer build and reports it', async () => {
    const name = uniqueName();
    const errors: string[] = [];
    const store = createStoreHooks<{ theme: string }>(name, {
      persist: { read: () => ({ ...saved({ theme: 'dark' }), schema: 9 }), write: () => {} },
      persistVersion: 1,
      onRestoreError: (error) => errors.push(error.reason),
    });

    function App() {
      const [theme] = store.useSharedState('theme', 'light');
      return <span data-testid="theme">{theme}</span>;
    }
    render(<App />);
    await flush();

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(errors).toEqual(['ahead']);
  });
});
