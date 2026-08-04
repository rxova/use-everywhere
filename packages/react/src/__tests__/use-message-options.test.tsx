import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createChannel } from '@use-everywhere/core';
import { useState } from 'react';
import { useAnswer, useAsk, useChannel, useMessage } from '../use-message.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

let n = 0;
const uniqueName = () => `umo-${++n}`;

type Requests = { ping: number; 'config:get': null };
type Replies = { 'config:get': { theme: string } };

const otherTab = (name: string) =>
  createChannel<Requests, Replies>(name, {
    transport: (busName) => new BroadcastChannelTransport(busName),
  });

describe('useMessage options', () => {
  it('does not subscribe when disabled, and subscribes when enabled turns on', async () => {
    const name = uniqueName();
    const seen: number[] = [];

    function Listener() {
      const channel = useChannel<Requests, Replies>(name);
      const [on, setOn] = useState(false);
      useMessage(channel, 'ping', (value) => seen.push(value), { enabled: on });
      return <button onClick={() => setOn(true)}>enable</button>;
    }
    render(<Listener />);
    const peer = otherTab(name);
    await flush();

    act(() => peer.post('ping', 1));
    await flush();
    // Unsubscribed, not filtered inside the handler — the point is that a
    // component which is not interested costs nothing.
    expect(seen).toEqual([]);

    act(() => screen.getByText('enable').click());
    await flush();
    act(() => peer.post('ping', 2));
    await flush();
    expect(seen).toEqual([2]);

    peer.close();
  });

  it('honours once, so a handler fires a single time', async () => {
    const name = uniqueName();
    const seen: number[] = [];

    function Listener() {
      const channel = useChannel<Requests, Replies>(name);
      useMessage(channel, 'ping', (value) => seen.push(value), { once: true });
      return null;
    }
    render(<Listener />);
    const peer = otherTab(name);
    await flush();

    act(() => peer.post('ping', 1));
    await flush();
    act(() => peer.post('ping', 2));
    await flush();

    expect(seen).toEqual([1]);
    peer.close();
  });
});

describe('useAnswer and useAsk', () => {
  it('answers a peer for as long as the component is mounted', async () => {
    const name = uniqueName();

    function Responder() {
      const channel = useChannel<Requests, Replies>(name);
      const [theme] = useState('dark');
      // Closes over render state, and must stay fresh without resubscribing.
      useAnswer(channel, 'config:get', () => ({ theme }));
      return null;
    }
    const view = render(<Responder />);
    const peer = otherTab(name);
    await flush();

    await expect(peer.ask('config:get', null, { timeoutMs: 500 })).resolves.toEqual({
      theme: 'dark',
    });

    // Unmounted, the responder goes with it rather than outliving the tree.
    view.unmount();
    await flush();
    await expect(peer.ask('config:get', null, { timeoutMs: 60 })).rejects.toThrow(
      /nobody answered/,
    );

    peer.close();
  });

  it('stands down when disabled', async () => {
    const name = uniqueName();

    function Responder() {
      const channel = useChannel<Requests, Replies>(name);
      useAnswer(channel, 'config:get', () => ({ theme: 'dark' }), { enabled: false });
      return null;
    }
    render(<Responder />);
    const peer = otherTab(name);
    await flush();

    await expect(peer.ask('config:get', null, { timeoutMs: 60 })).rejects.toThrow(
      /nobody answered/,
    );

    peer.close();
  });

  it('gives a component a stable ask function', async () => {
    const name = uniqueName();
    const seen = new Set<unknown>();
    let answered = '';

    function Asker() {
      const channel = useChannel<Requests, Replies>(name);
      const ask = useAsk(channel);
      seen.add(ask);
      const [label, setLabel] = useState('idle');
      return (
        <button
          onClick={() => {
            void ask('config:get', null, { timeoutMs: 500 }).then((reply) => {
              answered = reply.theme;
              setLabel(reply.theme);
            });
          }}
        >
          {label}
        </button>
      );
    }
    render(<Asker />);
    const peer = otherTab(name);
    peer.answer('config:get', () => ({ theme: 'light' }));
    await flush();

    act(() => screen.getByText('idle').click());
    await flush();
    await flush();

    expect(answered).toBe('light');
    // Re-rendered with new state, same function — safe in a dependency array.
    expect(seen.size).toBe(1);

    peer.close();
  });
});
