import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createSharedStore } from '@use-everywhere/core';
import { useSharedState } from '../use-shared-state.js';
import type { ShareScope } from '../use-shared-state.types.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

function otherClient(name: string, kind: 'tab' | 'worker') {
  return createSharedStore(
    name,
    { count: 0 },
    { transport: (n) => new BroadcastChannelTransport(n), kind },
  );
}

function Counter({ store, scope }: { store: string; scope: ShareScope }) {
  const [count, setCount] = useSharedState('count', 0, { store, scope });
  return (
    <button data-testid="count" onClick={() => setCount((c) => c + 1)}>
      {count}
    </button>
  );
}

describe('useSharedState scope option', () => {
  it("scope 'tab' shares between components but never across tabs", async () => {
    function Pair() {
      const [a] = useSharedState('count', 0, { store: 's1', scope: 'tab' });
      const [, setB] = useSharedState('count', 0, { store: 's1', scope: 'tab' });
      return (
        <>
          <span data-testid="a">{a}</span>
          <button data-testid="bump" onClick={() => setB(5)} />
        </>
      );
    }
    render(<Pair />);
    const peer = otherClient('s1', 'tab');
    await flush();

    act(() => peer.set('count', 99)); // another tab writes — must NOT arrive
    await flush();
    expect(screen.getByTestId('a').textContent).toBe('0');

    act(() => screen.getByTestId('bump').click()); // same-tab sharing still works
    await flush();
    expect(screen.getByTestId('a').textContent).toBe('5');

    expect(peer.getSnapshot().count).toBe(99); // and nothing leaked out
    peer.close();
  });

  it("scope 'tabs' accepts writes from tabs but ignores workers", async () => {
    render(<Counter store="s2" scope="tabs" />);
    const worker = otherClient('s2', 'worker');
    const tab = otherClient('s2', 'tab');
    await flush();

    act(() => worker.set('count', 13));
    await flush();
    expect(screen.getByTestId('count').textContent).toBe('0');

    act(() => tab.set('count', 2));
    await flush();
    expect(screen.getByTestId('count').textContent).toBe('2');

    worker.close();
    tab.close();
  });

  it("scope 'everywhere' accepts writes from workers too", async () => {
    render(<Counter store="s3" scope="everywhere" />);
    const worker = otherClient('s3', 'worker');
    await flush();

    act(() => worker.set('count', 8));
    await flush();

    expect(screen.getByTestId('count').textContent).toBe('8');
    worker.close();
  });

  it('scopes are independent namespaces for the same store name', async () => {
    function Both() {
      const [shared] = useSharedState('count', 0, { store: 's4', scope: 'everywhere' });
      const [local] = useSharedState('count', 0, { store: 's4', scope: 'tab' });
      return (
        <>
          <span data-testid="shared">{shared}</span>
          <span data-testid="local">{local}</span>
        </>
      );
    }
    render(<Both />);
    const peer = otherClient('s4', 'tab');
    await flush();

    act(() => peer.set('count', 3));
    await flush();

    expect(screen.getByTestId('shared').textContent).toBe('3');
    expect(screen.getByTestId('local').textContent).toBe('0');
    peer.close();
  });
});
