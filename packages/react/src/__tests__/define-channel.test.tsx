import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createChannel } from '@use-everywhere/core';
import { useState } from 'react';
import { defineChannel } from '../define-channel.js';
import { useChannel } from '../use-message.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

type Messages = { ping: { n: number } };

function otherTab(name: string) {
  return createChannel<Messages>(name, {
    transport: (n) => new BroadcastChannelTransport(n),
  });
}

describe('defineChannel', () => {
  it('receives typed messages through the bound useMessage', async () => {
    const bound = defineChannel<Messages>('dc1');
    function Listener() {
      const [last, setLast] = useState<number | null>(null);
      bound.useMessage('ping', ({ n }) => setLast(n));
      return <span data-testid="last">{String(last)}</span>;
    }
    render(<Listener />);
    const peer = otherTab('dc1');
    await flush();

    act(() => peer.post('ping', { n: 7 }));
    await flush();

    expect(screen.getByTestId('last').textContent).toBe('7');
    peer.close();
  });

  it('sends through the bound useSend, with sender meta', async () => {
    const bound = defineChannel<Messages>('dc2');
    function Sender() {
      const send = bound.useSend();
      return <button onClick={() => send('ping', { n: 3 })}>go</button>;
    }
    render(<Sender />);
    const peer = otherTab('dc2');
    await flush();

    const received: number[] = [];
    let self: boolean | null = null;
    peer.on('ping', ({ n }, meta) => {
      received.push(n);
      self = meta.self;
    });
    act(() => screen.getByText('go').click());
    await flush();

    expect(received).toEqual([3]);
    expect(self).toBe(false);
    peer.close();
  });

  it('shares one underlying channel with the standalone hooks and get()', async () => {
    const bound = defineChannel<Messages>('dc3');
    let standalone: unknown;
    function Probe() {
      standalone = useChannel<Messages>('dc3');
      return null;
    }
    render(<Probe />);

    expect(bound.get()).toBe(standalone);
    expect(defineChannel<Messages>('dc3').get()).toBe(bound.get());
  });

  it('keeps the bound handler fresh across renders', async () => {
    const bound = defineChannel<Messages>('dc4');
    function Accumulator() {
      const [sum, setSum] = useState(0);
      // Closes over `sum`: a stale handler would keep adding to 0.
      bound.useMessage('ping', ({ n }) => setSum(sum + n));
      return <span data-testid="sum">{sum}</span>;
    }
    render(<Accumulator />);
    const peer = otherTab('dc4');
    await flush();

    act(() => peer.post('ping', { n: 10 }));
    await flush();
    act(() => peer.post('ping', { n: 5 }));
    await flush();

    expect(screen.getByTestId('sum').textContent).toBe('15');
    peer.close();
  });
});
