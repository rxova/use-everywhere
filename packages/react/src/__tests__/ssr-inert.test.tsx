// @vitest-environment node
// The rest of the suite runs in happy-dom, where `window` exists and the hooks
// build real engines. This file is the server: no window, so the registry must
// hand back inert doubles. Rendering on a server used to open transports, arm
// presence heartbeats and start a leader election on intervals nothing ever
// cleared — one leak per name, per process, for the life of the server.
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChannel, getLeader, getPresence, getStore } from '../registry.js';
import { useClientId, usePeers } from '../use-peers.js';
import { useIsLeader, useLeader } from '../use-leader.js';
import { useSharedState } from '../use-shared-state.js';

describe('server rendering is inert', () => {
  afterEach(() => vi.restoreAllMocks());

  it('schedules no timers while rendering every hook', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const timeout = vi.spyOn(globalThis, 'setTimeout');

    function Everything() {
      const [value] = useSharedState('k', 'initial', { store: 'inert' });
      const peers = usePeers({ name: 'inert' });
      const id = useClientId({ name: 'inert' });
      const leading = useIsLeader({ name: 'inert' });
      return (
        <span>
          {value}:{peers.length}:{id}:{String(leading)}
        </span>
      );
    }

    const html = renderToString(<Everything />);

    expect(html).toContain('initial');
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  });

  it('renders the client id as empty, so hydration cannot mismatch', () => {
    // A server-invented id could never match the one the browser mints.
    // Rendered as an attribute, not text: React splices comment markers between
    // adjacent text nodes, which would obscure what is being asserted.
    function Who() {
      return <span data-client-id={useClientId({ name: 'inert-id' })} />;
    }

    expect(renderToString(<Who />)).toContain('data-client-id=""');
  });

  it('reports no leader — there is no election on a server', () => {
    function Crown() {
      const { leaderId, isLeader } = useLeader({ name: 'inert-leader' });
      return <span>{isLeader ? 'me' : (leaderId ?? 'none')}</span>;
    }

    expect(renderToString(<Crown />)).toContain('none');
  });

  it('gives every engine a safe, do-nothing surface', async () => {
    const store = getStore('stub', 'everywhere');
    const presence = getPresence('stub');
    const leader = getLeader('stub');
    const channel = getChannel('stub');

    // Writes are dropped rather than thrown: a component that sets state in an
    // effect must not crash a server render.
    expect(() => {
      store.set('k', 1);
      store.registerKey('k', 1);
      channel.post('ping', 1);
      leader.setEligible(false);
      leader.resign();
    }).not.toThrow();

    expect(store.getSnapshot()).toEqual({});
    expect(store.getVersions()).toEqual({});
    expect(store.state).toEqual({});
    expect(store.clientId).toBe('');
    expect(presence.getPeers()).toEqual([]);
    expect(presence.clientId).toBe('');
    expect(leader.getSnapshot()).toEqual({ leaderId: null, isLeader: false });
    expect(leader.clientId).toBe('');
    expect(leader.strategy).toBe('heartbeat');

    // waitForLeadership never settles on a server: there is no election to win,
    // and resolving would run leader-only work during a render that is about to
    // be discarded. Pending is the honest answer, so assert it stays pending.
    const settled = vi.fn();
    void leader.waitForLeadership().then(settled, settled);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).not.toHaveBeenCalled();
    expect(channel.name).toBe('stub');
    expect(channel.clientId).toBe('');

    // Subscriptions hand back working unsubscribes that no-op.
    expect(() => {
      store.subscribe(() => {})();
      store.subscribeKey('k', () => {})();
      presence.subscribe(() => {})();
      leader.subscribe(() => {})();
      channel.on('ping', () => {})();
      store.close();
      presence.close();
      leader.close();
      channel.close();
    }).not.toThrow();
  });
});
