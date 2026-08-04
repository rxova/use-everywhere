# @use-everywhere/test-utils

Test seams for [use-everywhere](https://github.com/rxova/use-everywhere): run
several simulated tabs in one process, with no browser and no globals.

```sh
pnpm add -D @use-everywhere/test-utils
```

```ts
import { createScenario } from '@use-everywhere/test-utils';

it('two tabs converge', async () => {
  const browser = createScenario();
  const cartA = browser.tab().store('cart', { items: 0 });
  const cartB = browser.tab().store('cart', { items: 0 });

  cartA.set('items', 3);
  await browser.settle();

  expect(cartB.getSnapshot().items).toBe(3);
  browser.dispose();
});
```

## Close is not crash

The reason multi-tab code is hard is that a tab can leave in two ways, and only
one of them says goodbye. Both are one call here:

```ts
const browser = createScenario();
const a = browser.tab();
const b = browser.tab();
const first = a.leader('app');
const second = b.leader('app');

a.crash(); // the wire is cut mid-sentence: no goodbye, no resignation
await browser.settle();

expect(second.getSnapshot().isLeader).toBe(true); // the platform reclaimed the seat
```

`close()` closes the primitives and then the wire, so peers are _told_.
`crash()` closes the wire first and reclaims the tab's Web Locks, so peers have
to _notice_ — which is the path that finds the bugs.

## What's in the box

| Export                         | What it is                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `createScenario(options?)`     | One simulated browser: a shared hub, shared Web Locks, and tabs                  |
| `FakeLockManager`              | `navigator.locks` with FIFO queueing and reclamation on crash                    |
| `FakeWindow`, `fakeWindowPair` | Enough `Window` for `openWindow` / `connectToOpener`, including hostile messages |
| `tick`, `snapshotWindow`       | The two waits that matter: delivery, and the late-joiner snapshot window         |
| `MemoryHub`, `MemoryTransport` | Re-exported from `@use-everywhere/core/testing` — same classes, one import       |

`createScenario({ election: 'heartbeat' })` runs the election that plain-http
origins get, where Web Locks does not exist. Test both if you ship to one.

## One primitive per name per tab

A `Tab` is a lifecycle group. Each primitive created through it gets its own
connection to the hub — the same shape a real tab has when it uses several bus
names — so a presence and a store created on _one_ name in one tab announce
themselves as two clients. Keep one primitive per name per tab and the
simulation matches a browser exactly.

## Docs

[Testing guide](https://rxova.github.io/use-everywhere/guides/testing/)

## License

MIT © [Jonatan Kruszewski](https://github.com/rxova)
