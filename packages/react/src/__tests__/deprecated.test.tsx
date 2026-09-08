import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { BroadcastChannelTransport, createChannel, type OpenedWindow } from '@use-everywhere/core';
import { defineStore, useMessage, useOpenedWindow, useSharedStore } from '../deprecated.js';
import { warnRenamed } from '../dev.js';
import { useChannel } from '../use-on-message.js';
import { defineChannel } from '../define-channel.js';
import { createNamespace } from '../namespace.js';
import { useSharedState } from '../use-shared-state.js';
import { getSharedStore } from '../registry.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

// Registry singletons live for the page, and `devWarn` dedupes for the module's
// lifetime, so both need a fresh name per test rather than a reset.
let n = 0;
const uniqueName = () => `dep-${++n}`;

// The lines are collected rather than read back off the spy: `console.warn` is
// variadic and typing its mock is more ceremony than the assertions are worth.
let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(String(args[0]));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The shape every rename warning carries, so each test asserts on one thing. */
const warnedAbout = (name: string) =>
  warnings.some((line) => line.includes('UE2005') && line.includes(name));

describe('the 0.x names still work', () => {
  it('useMessage delivers messages, exactly as useOnMessage does', async () => {
    type Messages = { ping: { n: number } };
    const name = uniqueName();

    function Listener() {
      const channel = useChannel<Messages>(name);
      const [last, setLast] = useState<number | null>(null);
      useMessage(channel, 'ping', ({ n }) => setLast(n));
      return <span data-testid="last">{String(last)}</span>;
    }
    render(<Listener />);
    const peer = createChannel<Messages>(name, {
      transport: (busName) => new BroadcastChannelTransport(busName),
    });
    await flush();

    act(() => peer.post('ping', { n: 7 }));
    await flush();

    expect(screen.getByTestId('last').textContent).toBe('7');
    expect(warnedAbout('useMessage')).toBe(true);
    peer.close();
  });

  it('defineStore registers options and hands back working hooks', async () => {
    const name = uniqueName();
    const settings = defineStore<{ theme: string }>(name);

    function Theme() {
      const [theme, setTheme] = settings.useSharedState('theme', 'light');
      return (
        <button data-testid="theme" onClick={() => setTheme('dark')}>
          {theme}
        </button>
      );
    }
    render(<Theme />);
    await flush();

    expect(screen.getByTestId('theme').textContent).toBe('light');
    act(() => screen.getByTestId('theme').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(warnedAbout('defineStore')).toBe(true);
  });

  it('useSharedStore subscribes to a slice, exactly as useSharedSelector does', async () => {
    const name = uniqueName();

    function Total() {
      const [, setCount] = useSharedState('count', 1, { store: name });
      const doubled = useSharedStore<{ count: number }, number>((state) => (state.count ?? 0) * 2, {
        store: name,
      });
      return (
        <button data-testid="total" onClick={() => setCount(5)}>
          {doubled}
        </button>
      );
    }
    render(<Total />);
    await flush();

    expect(screen.getByTestId('total').textContent).toBe('2');
    act(() => screen.getByTestId('total').click());
    await flush();

    expect(screen.getByTestId('total').textContent).toBe('10');
    expect(warnedAbout('useSharedStore')).toBe(true);
  });

  it('useOpenedWindow tracks a window, exactly as useWindowResult does', async () => {
    // The hook only ever reads the handle its factory returns, so an inert one
    // is enough to exercise the wrapper — and it keeps the test off a real
    // popup, which happy-dom does not have. Mirrors use-window-result.test.tsx.
    const opened: OpenedWindow<Record<never, never>, Record<never, never>, unknown> = {
      window: null,
      ready: new Promise<void>(() => {}),
      result: new Promise<unknown>(() => {}),
      closed: new Promise<void>(() => {}),
      post: vi.fn(),
      on: vi.fn(() => () => {}),
      close: vi.fn(),
    };

    function Payment() {
      const pay = useOpenedWindow(() => opened);
      return <span data-testid="status">{pay.status}</span>;
    }
    render(<Payment />);
    await flush();

    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(warnedAbout('useOpenedWindow')).toBe(true);
  });

  it('StoreHooks.get() returns the same store as StoreHooks.store()', () => {
    const name = uniqueName();
    const settings = defineStore(name);

    expect(settings.get()).toBe(settings.store());
    expect(settings.get()).toBe(getSharedStore(name));
    expect(warnedAbout('StoreHooks.get()')).toBe(true);
  });

  it('ChannelHooks.useMessage subscribes, exactly as ChannelHooks.useOnMessage does', async () => {
    type Messages = { ping: { n: number } };
    const name = uniqueName();
    const hooks = defineChannel<Messages>(name);

    function Listener() {
      const [last, setLast] = useState<number | null>(null);
      hooks.useMessage('ping', ({ n }) => setLast(n));
      return <span data-testid="last">{String(last)}</span>;
    }
    render(<Listener />);
    const peer = createChannel<Messages>(name, {
      transport: (busName) => new BroadcastChannelTransport(busName),
    });
    await flush();

    act(() => peer.post('ping', { n: 3 }));
    await flush();

    expect(screen.getByTestId('last').textContent).toBe('3');
    expect(warnedAbout('ChannelHooks.useMessage')).toBe(true);
    peer.close();
  });

  it('Namespace.defineStore and Namespace.useSharedStore stay bound to the namespace', async () => {
    const ns = createNamespace(uniqueName());
    const settings = ns.defineStore<{ theme: string }>('settings');

    function Theme() {
      const [theme] = settings.useSharedState('theme', 'light');
      const upper = ns.useSharedStore<{ theme: string }, string>(
        (state) => (state.theme ?? '').toUpperCase(),
        { store: 'settings' },
      );
      return <span data-testid="theme">{`${theme} ${upper}`}</span>;
    }
    render(<Theme />);
    await flush();

    expect(screen.getByTestId('theme').textContent).toBe('light LIGHT');
    expect(warnedAbout('Namespace.defineStore')).toBe(true);
    expect(warnedAbout('Namespace.useSharedStore')).toBe(true);
  });
});

describe('the warning itself', () => {
  it('names the new spelling and the codemod, and fires once per name', () => {
    warnRenamed('someOldName', 'someNewName');
    warnRenamed('someOldName', 'someNewName');

    const lines = warnings.filter((line) => line.includes('someOldName'));
    expect(lines).toHaveLength(1);
    expect(lines[0]!).toContain('UE2005');
    expect(lines[0]!).toContain('`someNewName`');
    expect(lines[0]!).toContain('npx use-everywhere-codemod rename-1.0 src/');
    // The link is the promise the errors page keeps; see tooling/error-codes.test.ts.
    expect(lines[0]!).toContain('#ue2005');
  });
});
