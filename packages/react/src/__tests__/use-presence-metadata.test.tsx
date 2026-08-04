import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createPresence } from '@use-everywhere/core';
import { useState } from 'react';
import { usePeers, usePresenceMetadata } from '../use-peers.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

let n = 0;
const uniqueName = () => `upm-${++n}`;

const otherTab = (name: string, metadata?: unknown) =>
  createPresence(name, {
    transport: (busName) => new BroadcastChannelTransport(busName),
    ...(metadata === undefined ? {} : { metadata }),
  });

describe('usePresenceMetadata', () => {
  it('republishes when the value changes', async () => {
    const name = uniqueName();
    const watcher = otherTab(name);

    function Me() {
      const [who, setWho] = useState('Ada');
      usePresenceMetadata({ display: who }, { name });
      return <button onClick={() => setWho('Grace')}>{who}</button>;
    }
    render(<Me />);
    await flush();
    expect(watcher.getPeers()[0]?.metadata).toEqual({ display: 'Ada' });

    act(() => screen.getByText('Ada').click());
    await flush();

    expect(watcher.getPeers()[0]?.metadata).toEqual({ display: 'Grace' });
    watcher.close();
  });

  it('reaches a peer watching the same bus', async () => {
    const name = uniqueName();
    const watcher = otherTab(name);

    function Me() {
      usePresenceMetadata({ display: 'Ada' }, { name });
      return null;
    }
    render(<Me />);
    await flush();

    expect(watcher.getPeers()[0]?.metadata).toEqual({ display: 'Ada' });
    watcher.close();
  });

  it('announces nothing for an unchanged value built fresh each render', async () => {
    const name = uniqueName();
    const watcher = otherTab(name);
    let notifications = 0;

    function Me() {
      const [, bump] = useState(0);
      // A new object every render, which is what a hook caller writes.
      usePresenceMetadata({ display: 'Ada' }, { name });
      return <button onClick={() => bump((v) => v + 1)}>bump</button>;
    }
    render(<Me />);
    await flush();
    watcher.subscribe(() => notifications++);

    act(() => screen.getByText('bump').click());
    await flush();

    // Compared by contents, so re-rendering does not churn every other tab.
    expect(notifications).toBe(0);
    watcher.close();
  });
});

describe('usePeers includeSelf', () => {
  it('publishes on the default bus when called bare', async () => {
    function Me() {
      usePresenceMetadata({ display: 'default-bus' });
      const peers = usePeers({ includeSelf: true });
      return <span data-testid="n">{peers.length}</span>;
    }
    render(<Me />);
    await flush();

    // No name and no options at all: the path every first-time caller takes.
    expect(Number(screen.getByTestId('n').textContent)).toBeGreaterThanOrEqual(1);
  });

  it('leaves this client out by default', async () => {
    const name = uniqueName();

    function Roster() {
      const peers = usePeers({ name });
      return <span data-testid="n">{peers.length}</span>;
    }
    render(<Roster />);
    await flush();

    expect(screen.getByTestId('n').textContent).toBe('0');
  });

  it('includes this client when asked, from the first render', async () => {
    const name = uniqueName();

    function Roster() {
      const peers = usePeers({ name, includeSelf: true });
      return <span data-testid="n">{peers.length}</span>;
    }
    render(<Roster />);

    // Before any flush: an avatar list that starts empty and fills in later is
    // a flicker, not a feature.
    expect(screen.getByTestId('n').textContent).toBe('1');
  });

  it('carries metadata published by this tab into its own entry', async () => {
    const name = uniqueName();

    function Roster() {
      usePresenceMetadata({ display: 'me' }, { name, includeSelf: true });
      const peers = usePeers({ name, includeSelf: true });
      return (
        <span data-testid="who">
          {String((peers[0]?.metadata as { display?: string })?.display)}
        </span>
      );
    }
    render(<Roster />);
    await flush();

    expect(screen.getByTestId('who').textContent).toBe('me');
  });
});
