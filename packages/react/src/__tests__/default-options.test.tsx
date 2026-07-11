import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NAME, getSharedStore } from '../registry.js';
import { useSharedState } from '../use-shared-state.js';
import { useClientId, usePeers } from '../use-peers.js';

describe('hooks called without options use the default name and scope', () => {
  it('useSharedState writes into the default everywhere-store', () => {
    function Bare() {
      const [v] = useSharedState('bare-key', 'fallback');
      return <span data-testid="v">{v}</span>;
    }
    render(<Bare />);

    expect(screen.getByTestId('v').textContent).toBe('fallback');
    expect(getSharedStore(DEFAULT_NAME).getSnapshot()['bare-key']).toBe('fallback');
  });

  it('usePeers and useClientId default to the same presence', () => {
    function Bare() {
      const peers = usePeers();
      const id = useClientId();
      return (
        <span data-testid="p">
          {peers.length}:{id}
        </span>
      );
    }
    render(<Bare />);

    expect(screen.getByTestId('p').textContent).toMatch(/^0:[a-z0-9]{6}$/);
  });
});
