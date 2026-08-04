import { createPresence, createSharedStore, getTransportKind } from '@use-everywhere/core';

/**
 * The transport-degradation fixture.
 *
 * The point is that nothing here asks for a particular transport. The suite
 * removes `BroadcastChannel` — and in one case breaks `localStorage` too —
 * before this module is evaluated, so the library walks its own fallback chain
 * and this page merely reports where it landed.
 *
 * Its own bus name, so an ordinary demo tab in the same run is not dragged onto
 * a degraded transport.
 */
const NAME = 'degradation-fixture';

const store = createSharedStore(NAME, { shared: 0 });
const presence = createPresence(NAME);

const set = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const render = () => {
  // Reported rather than assumed: `getTransportKind` is the answer to "is
  // anything even connected", and 'none' is the case worth proving is loud.
  set('transport', getTransportKind(NAME) ?? 'no-bus');
  set('client', presence.clientId);
  set('value', String(store.getSnapshot().shared));
  set('peers', String(presence.getPeers().length));
};

store.subscribe(render);
presence.subscribe(render);
setInterval(render, 100);
render();

(globalThis as unknown as Record<string, unknown>).degradation = {
  bump: () => store.set('shared', (n) => n + 1),
};
