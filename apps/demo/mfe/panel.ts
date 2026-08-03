import {
  createLeader,
  createPresence,
  createSharedStore,
  DEFAULT_NAME,
} from '@use-everywhere/core';

/**
 * One micro-frontend's worth of the library, rendered into plain DOM.
 *
 * Imported by `a.ts` and `b.ts`, which are built **separately** — so each
 * bundle inlines its own copy of this file *and its own copy of the core*.
 * That is the whole point of the fixture: on the page there are two independent
 * builds that have never seen each other, exactly as two micro-frontends
 * deployed by two teams would be.
 */
// The demo app's own bus, deliberately: it lets an ordinary demo tab act as the
// outside observer and report how many peers this page looks like from there.
const NAME = DEFAULT_NAME;

export function mount(prefix: 'a' | 'b'): void {
  const presence = createPresence(NAME);
  const store = createSharedStore(NAME, { shared: 0 });
  const leader = createLeader(NAME, { strategy: 'heartbeat' });

  const set = (field: string, value: string) => {
    const el = document.getElementById(`${prefix}-${field}`);
    if (el) el.textContent = value;
  };

  const render = () => {
    set('client', presence.clientId);
    set('peers', String(presence.getPeers().length));
    set('value', String(store.getSnapshot().shared));
    set('leader', leader.getSnapshot().isLeader ? 'yes' : 'no');
  };

  presence.subscribe(render);
  store.subscribe(render);
  leader.subscribe(render);
  render();

  // The seam the test drives: bumping in one bundle and reading the other's DOM
  // in the same task is what proves delivery is synchronous rather than a
  // BroadcastChannel round trip.
  (globalThis as unknown as Record<string, unknown>)[`mfe_${prefix}`] = {
    bump: () => store.set('shared', (n) => n + 1),
  };
}
