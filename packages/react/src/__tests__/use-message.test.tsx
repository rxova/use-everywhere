import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createChannel } from '@use-everywhere/core';
import { useState } from 'react';
import { useChannel, useMessage } from '../use-message.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

type Messages = { ping: { n: number } };

function otherTab(name: string) {
  return createChannel<Messages>(name, {
    transport: (n) => new BroadcastChannelTransport(n),
  });
}

describe('useMessage', () => {
  it('receives typed messages from another tab', async () => {
    function Listener() {
      const channel = useChannel<Messages>('m1');
      const [last, setLast] = useState<number | null>(null);
      useMessage(channel, 'ping', ({ n }) => setLast(n));
      return <span data-testid="last">{String(last)}</span>;
    }
    render(<Listener />);
    const peer = otherTab('m1');
    await flush();

    act(() => peer.post('ping', { n: 42 }));
    await flush();

    expect(screen.getByTestId('last').textContent).toBe('42');
    peer.close();
  });

  it('keeps the handler fresh across renders without resubscribing', async () => {
    function Accumulator() {
      const channel = useChannel<Messages>('m2');
      const [sum, setSum] = useState(0);
      // Closes over `sum`: a stale handler would keep adding to 0.
      useMessage(channel, 'ping', ({ n }) => setSum(sum + n));
      return <span data-testid="sum">{sum}</span>;
    }
    render(<Accumulator />);
    const peer = otherTab('m2');
    await flush();

    act(() => peer.post('ping', { n: 10 }));
    await flush();
    act(() => peer.post('ping', { n: 5 }));
    await flush();

    expect(screen.getByTestId('sum').textContent).toBe('15');
    peer.close();
  });

  it('stops delivering after unmount', async () => {
    let calls = 0;
    function Listener() {
      const channel = useChannel<Messages>('m3');
      useMessage(channel, 'ping', () => calls++);
      return null;
    }
    const { unmount } = render(<Listener />);
    const peer = otherTab('m3');
    await flush();

    unmount();
    act(() => peer.post('ping', { n: 1 }));
    await flush();

    expect(calls).toBe(0);
    peer.close();
  });
});
