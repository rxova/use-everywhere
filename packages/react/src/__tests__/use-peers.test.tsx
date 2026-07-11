import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, createPresence } from '@use-everywhere/core';
import { usePeers } from '../use-peers.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

function PeerList({ name }: { name: string }) {
  const peers = usePeers({ name });
  return <span data-testid="peers">{peers.map((p) => p.id).join(',')}</span>;
}

describe('usePeers', () => {
  it('shows another tab joining and leaving', async () => {
    render(<PeerList name="p1" />);
    await flush();
    expect(screen.getByTestId('peers').textContent).toBe('');

    const peer = createPresence('p1', {
      transport: (n) => new BroadcastChannelTransport(n),
    });
    await flush();
    expect(screen.getByTestId('peers').textContent).toBe(peer.clientId);

    act(() => peer.close()); // posts bye
    await flush();
    expect(screen.getByTestId('peers').textContent).toBe('');
  });
});
