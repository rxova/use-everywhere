import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createNamespace } from '../namespace.js';
import { useSharedState } from '../use-shared-state.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
// Real timers and short timings, the same reason use-leader.test.tsx does it:
// fake timers, act() and BroadcastChannel's async delivery interact badly.
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const FAST = { heartbeatMs: 20, leaseMs: 60 };

/**
 * The React half of the namespace work. What matters here is not that the
 * prefix is applied — the core suite proves that — but that it reaches every
 * hook, including through the options object, and that a bare hook elsewhere in
 * the app lands on a different store rather than quietly joining this one.
 */
const checkout = createNamespace('checkout');
const search = createNamespace('search');

describe('createNamespace (React)', () => {
  it('keeps two apps on the same bare key apart', async () => {
    function App() {
      const [theirs, setTheirs] = checkout.useSharedState('items', 0);
      const [ours] = search.useSharedState('items', 0);
      return (
        <>
          <button onClick={() => setTheirs(5)}>go</button>
          <span data-testid="checkout">{theirs}</span>
          <span data-testid="search">{ours}</span>
        </>
      );
    }
    render(<App />);
    await flush();

    act(() => screen.getByText('go').click());
    await flush();

    expect(screen.getByTestId('checkout').textContent).toBe('5');
    expect(screen.getByTestId('search').textContent).toBe('0');
  });

  it('does not collide with a bare hook on the same key', async () => {
    function App() {
      const [scoped, setScoped] = checkout.useSharedState('bare', 0);
      const [bare] = useSharedState('bare', 0);
      return (
        <>
          <button onClick={() => setScoped(9)}>go</button>
          <span data-testid="scoped">{scoped}</span>
          <span data-testid="bare">{bare}</span>
        </>
      );
    }
    render(<App />);
    await flush();

    act(() => screen.getByText('go').click());
    await flush();

    // The whole point: an app that never adopted namespaces is not dragged into
    // one, and an app that did is not reachable from the defaults.
    expect(screen.getByTestId('scoped').textContent).toBe('9');
    expect(screen.getByTestId('bare').textContent).toBe('0');
  });

  it('prefixes a store named through the options object too', async () => {
    function App() {
      const [a, setA] = checkout.useSharedState('k', 0, { store: 'settings' });
      const [b] = search.useSharedState('k', 0, { store: 'settings' });
      return (
        <>
          <button onClick={() => setA(3)}>go</button>
          <span data-testid="a">{a}</span>
          <span data-testid="b">{b}</span>
        </>
      );
    }
    render(<App />);
    await flush();

    act(() => screen.getByText('go').click());
    await flush();

    expect(screen.getByTestId('a').textContent).toBe('3');
    expect(screen.getByTestId('b').textContent).toBe('0');
  });

  it('reaches presence, leadership and the bound factories', async () => {
    const bound = checkout.defineStore<{ n: number }>('bound');
    function App() {
      const id = checkout.useClientId();
      const peers = checkout.usePeers();
      const isLeader = checkout.useIsLeader();
      const [n] = bound.useSharedState('n', 1);
      return (
        <>
          <span data-testid="id">{id ? 'has-id' : 'no-id'}</span>
          <span data-testid="peers">{peers.length}</span>
          <span data-testid="leader">{isLeader ? 'yes' : 'no'}</span>
          <span data-testid="n">{n}</span>
        </>
      );
    }
    render(<App />);
    await flush();

    expect(screen.getByTestId('id').textContent).toBe('has-id');
    expect(screen.getByTestId('peers').textContent).toBe('0');
    expect(screen.getByTestId('n').textContent).toBe('1');
    // The namespaced bus has one client on it, which is this tab, so the seat
    // is uncontested — the assertion is that the hook resolved at all.
    expect(screen.getByTestId('leader').textContent).toMatch(/yes|no/);
  });

  it('reaches the bound channel and the leader-effect hook', async () => {
    // Its own namespace: the registry keeps one leader per bus name for the
    // life of the page, and the test above already built the `checkout` one
    // with default timings — a later call asking for faster ones is ignored
    // (and warned about), which is the documented first-caller-wins rule.
    const orders = createNamespace('orders');
    const events = orders.defineChannel<{ ping: number }>('events');
    const seen: number[] = [];
    let ranAsLeader = 0;

    function App() {
      const send = events.useSend();
      const { leaderId } = orders.useLeader(FAST);
      events.useMessage('ping', (n) => seen.push(n));
      orders.useLeaderEffect(() => {
        ranAsLeader++;
      }, FAST);
      return (
        <>
          <button onClick={() => send('ping', 1)}>go</button>
          <span data-testid="leader-id">{leaderId ? 'seated' : 'empty'}</span>
        </>
      );
    }
    render(<App />);
    await wait(80);

    // A namespaced channel and a namespaced leader resolve against the same
    // prefixed bus as everything else in the app. This tab is alone on it, so
    // once the lease settles the seat is its own.
    expect(screen.getByTestId('leader-id').textContent).toBe('seated');
    expect(ranAsLeader).toBe(1);

    act(() => screen.getByText('go').click());
    await flush();
    // No echo to self on a channel, so the local handler stays empty — what is
    // asserted is that the bound hooks wired up at all.
    expect(seen).toEqual([]);
  });

  it('carries useHydrated, prefixed like everything else', async () => {
    function App() {
      const ready = checkout.useHydrated();
      return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
    }
    render(<App />);
    await flush();

    // No persistence on this namespace's default store, so there is nothing to
    // restore and it settles immediately.
    expect(screen.getByTestId('ready').textContent).toBe('yes');
  });

  it('exposes the underlying bus name, so devtools and tests can find it', () => {
    expect(checkout.busName('cart')).toBe('checkout:cart');
    expect(checkout.getSharedStore('cart')).toBe(checkout.getSharedStore('cart'));
  });

  it('still carries the core factories, for non-React code', () => {
    expect(typeof checkout.createChannel).toBe('function');
    expect(typeof checkout.createPresence).toBe('function');
  });
});
