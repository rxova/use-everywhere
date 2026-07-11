import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { usePeers } from '../use-peers.js';
import { useSharedState } from '../use-shared-state.js';

describe('server rendering', () => {
  it('renders initial values via getServerSnapshot without touching the store', () => {
    function Widget() {
      const [value] = useSharedState('ssr-key', 'ssr-initial', { store: 'ssr' });
      const peers = usePeers({ name: 'ssr' });
      return (
        <span>
          {value}:{peers.length}
        </span>
      );
    }

    const html = renderToString(<Widget />);

    expect(html).toContain('ssr-initial'); // shared value falls back to the initial
    expect(html).toMatch(/>0</); // peers render empty on the server
  });
});
