import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useLeader } from '../use-leader.js';
import { usePeers } from '../use-peers.js';
import { useSharedReducer } from '../use-shared-reducer.js';
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

  it('renders no leader on the server — there is no election to join', () => {
    function Crown() {
      const { leaderId, isLeader } = useLeader({ name: 'ssr-leader' });
      return <span>{isLeader ? 'me' : (leaderId ?? 'none')}</span>;
    }

    const html = renderToString(<Crown />);

    expect(html).toContain('none');
  });

  it('renders a reducer initial, and a dispatch on the server changes nothing', () => {
    function Counter() {
      const [count, dispatch] = useSharedReducer((n: number, a: { by: number }) => n + a.by, 7, {
        name: 'ssr-reducer',
      });
      // A server render has no peers to order anything with, so dispatching
      // here must not produce a value the browser is about to disagree with.
      dispatch({ by: 100 });
      return <span>{count}</span>;
    }

    const html = renderToString(<Counter />);

    expect(html).toContain('7');
  });
});
