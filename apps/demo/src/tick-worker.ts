import { createSharedStore } from '@use-everywhere/core';

// The same store the page's hooks use — one object, every tab AND this worker.
const store = createSharedStore('use-everywhere', { workerTicks: 0 }, { kind: 'worker' });

const timer = setInterval(() => store.set('workerTicks', (t) => t + 1), 1000);

onmessage = () => {
  clearInterval(timer);
  store.close(); // announces bye so presence dots update promptly
  close();
};
