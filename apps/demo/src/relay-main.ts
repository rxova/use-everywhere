import { SharedWorkerTransport, createSharedStore } from '@use-everywhere/core';

/**
 * The tab half of the relay fixture. Every tab of this page connects to one
 * SharedWorker, which owns the "connection" and publishes over the relay it is
 * itself hosting — so nothing on this page ever writes to the store.
 *
 * Its own bus name, so the ordinary demo tabs in the same suite are not dragged
 * onto this wire.
 */
const NAME = 'relay-fixture';

// Held, rather than constructed inline, so the page can report what it actually
// got. Without that the suite could not tell this apart from a run that quietly
// fell back to BroadcastChannel — which would satisfy every other assertion
// here while testing nothing the fixture exists for.
const transport = new SharedWorkerTransport({ url: '/relay/worker.js', name: NAME });

const store = createSharedStore(NAME, { tick: 0, socketId: '' }, { transport: () => transport });

const set = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const render = () => {
  const { tick, socketId } = store.getSnapshot();
  set('transport', transport.kind ?? 'unknown');
  set('client', store.clientId);
  set('tick', String(tick));
  set('socket', socketId);
};

store.subscribe(render);
render();
