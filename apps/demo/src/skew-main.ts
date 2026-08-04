import { createPresence, createSharedStore, getWireSkew } from '@use-everywhere/core';

/**
 * The version-skew fixture: a real store on a real bus, plus a seam for
 * speaking to it in a protocol version this build does not know.
 *
 * Only `v1` has ever shipped, so a genuinely older bundle cannot be built to
 * play the other side. Posting the foreign wire by hand over a plain
 * `BroadcastChannel` is the honest substitute — the receiving tab runs the
 * unmodified library and cannot tell the difference, because a wire is a wire
 * whatever produced it. What is being tested is the receiver.
 *
 * Its own bus name, so the ordinary demo tabs in the same suite are not dragged
 * into the skew ledger.
 */
const NAME = 'skew-fixture';

const store = createSharedStore(NAME, { shared: 0 });
const presence = createPresence(NAME);

const set = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const render = () => {
  set('client', presence.clientId);
  set('value', String(store.getSnapshot().shared));
  set('peers', String(presence.getPeers().length));
  // Rendered on every tick rather than only on change: skew is observed as a
  // side effect of receiving a wire, so there is no event of its own to
  // subscribe to — which is exactly why getWireSkew is a query.
  set('skew', getWireSkew(NAME).join(','));
};

store.subscribe(render);
presence.subscribe(render);
setInterval(render, 100);
render();

(globalThis as unknown as Record<string, unknown>).skew = {
  /** Write through the library, the way a peer on this generation would. */
  bump: () => store.set('shared', (n) => n + 1),
  /**
   * Write as a peer on another generation would: same bus, same envelope
   * shape, different `v`. The version clock is deliberately huge, so if the
   * receiver applied it at all it would win last-writer-wins outright — the
   * assertion is then about the envelope check and nothing else.
   */
  postAs: (v: number, value: number) => {
    const channel = new BroadcastChannel(NAME);
    channel.postMessage({
      v,
      scope: 'state',
      type: 'patch',
      key: 'shared',
      value,
      version: [9999, 'other-generation'],
      clientId: `generation-v${v}`,
      kind: 'tab',
    });
    channel.close();
  },
};
