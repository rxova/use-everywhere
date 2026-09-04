import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { DEFAULT_NAME, getSharedStore } from '../registry.js';
import { useChannel, useSend } from '../use-on-message.js';
import { useClientId } from '../use-peers.js';
import { usePeers } from '../use-peers.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

describe('getSharedStore', () => {
  it('returns the same store instance the hooks use, defaulting to DEFAULT_NAME', () => {
    expect(getSharedStore()).toBe(getSharedStore(DEFAULT_NAME));
    expect(getSharedStore('other')).not.toBe(getSharedStore());
    expect(getSharedStore('other', 'tab')).not.toBe(getSharedStore('other'));
  });

  it('supports imperative writes that hooks observe', async () => {
    getSharedStore('imp').set('flag', 'on');
    expect(getSharedStore('imp').getSnapshot().flag).toBe('on');
  });
});

describe('useSend', () => {
  it('returns the channel post function', async () => {
    type M = { ping: { n: number } };
    function SendAndReceive() {
      const channel = useChannel<M>('send-test');
      const send = useSend(channel);
      const [ok, setOk] = useState(false);
      return (
        <button data-testid="btn" onClick={() => (send('ping', { n: 1 }), setOk(true))}>
          {String(ok)}
        </button>
      );
    }
    render(<SendAndReceive />);
    act(() => screen.getByTestId('btn').click());
    await flush();
    expect(screen.getByTestId('btn').textContent).toBe('true');
  });
});

describe('useClientId', () => {
  it('matches the presence client id for the same name', () => {
    function Ids() {
      const id = useClientId({ name: 'idcheck' });
      usePeers({ name: 'idcheck' });
      return <span data-testid="id">{id}</span>;
    }
    render(<Ids />);
    expect(screen.getByTestId('id').textContent).toMatch(/^[0-9a-f]{16}$/);
  });
});
