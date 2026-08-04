import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createSharedStore } from '@use-everywhere/core';
import { useSharedState } from '../use-shared-state.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

/** A simulated "other tab": its own client on the same channel name. */
function otherTab<S extends Record<string, unknown>>(name: string, initial: S) {
  return createSharedStore(name, initial, {
    transport: (n) => new BroadcastChannelTransport(n),
  });
}

function Counter({ store }: { store: string }) {
  const [count, setCount] = useSharedState('count', 0, { store });
  return (
    <button data-testid="count" onClick={() => setCount((c) => c + 1)}>
      {count}
    </button>
  );
}

describe('useSharedState', () => {
  it('receives writes from another tab', async () => {
    render(<Counter store="t1" />);
    expect(screen.getByTestId('count').textContent).toBe('0');

    const peer = otherTab('t1', { count: 0 });
    await flush();
    act(() => peer.set('count', 41));
    await flush();

    expect(screen.getByTestId('count').textContent).toBe('41');
    peer.close();
  });

  it('propagates local writes to other tabs', async () => {
    render(<Counter store="t2" />);
    const peer = otherTab('t2', { count: 0 });
    await flush();

    act(() => screen.getByTestId('count').click());
    await flush();

    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(peer.getSnapshot().count).toBe(1);
    peer.close();
  });

  it('shares one value between components using the same key', async () => {
    function Two() {
      const [a] = useSharedState('count', 0, { store: 't3' });
      const [, setB] = useSharedState('count', 0, { store: 't3' });
      return (
        <>
          <span data-testid="a">{a}</span>
          <button data-testid="bump" onClick={() => setB(9)} />
        </>
      );
    }
    render(<Two />);

    act(() => screen.getByTestId('bump').click());
    await flush();

    expect(screen.getByTestId('a').textContent).toBe('9');
  });

  it('hydrates a late-joining hook from existing tab state', async () => {
    const peer = otherTab('t4', { count: 0 });
    peer.set('count', 7);
    await flush();

    render(<Counter store="t4" />); // registry store for t4 is created now
    // hello → snapshot → hydrate. The peer answers after a jittered pause now,
    // so that only one of N peers replies; a single flush is no longer enough.
    await act(() => new Promise<void>((r) => setTimeout(r, 80)));

    expect(screen.getByTestId('count').textContent).toBe('7');
    peer.close();
  });
});
