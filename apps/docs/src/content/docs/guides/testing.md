---
title: 'Testing'
description: 'Test cross-tab behaviour in one process — a scenario DSL, an in-memory bus, fake windows and fake Web Locks. No Playwright required.'
sidebar:
  order: 6
---

"Cross-tab behavior" sounds like something you'd need Playwright and three
browser windows to test. You don't need either. The library is built so
that **every engine accepts an injected transport, and the window channel
accepts injected windows** — the same seams its own test suite uses are
public API. In this guide we'll simulate five tabs in a unit test, put a real
component next to a fake "other tab", and drive the whole cross-origin window
lifecycle without opening a window.

## The short version: `@use-everywhere/test-utils`

Everything below is available directly, and worth reading — it is what the
library's own suite does. But the common cases are packaged:

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

One scenario is one simulated browser: a hub every tab shares, a `navigator.locks`
stand-in every tab queues on, and tabs that can be closed **or crashed** —

```ts
a.close(); // says goodbye: peers are told
a.crash(); // cuts the wire: peers have to notice, and the platform reclaims the lock
```

— which is the distinction the rest of this guide keeps coming back to. A `Tab`
is a lifecycle group: each primitive it creates gets its own hub connection, so
keep one primitive per name per tab and the simulation matches a browser
exactly.

The package also publishes `FakeWindow`/`fakeWindowPair` for the window-channel
seams, `FakeLockManager`, and `tick`/`snapshotWindow` — the two waits that
actually matter.

## Simulate many tabs in one test: `MemoryHub`

A `MemoryHub` is an in-process stand-in for the browser's channel: every
transport connected to it receives every _other_ transport's posts,
asynchronously, structured-cloned per delivery, with no self-echo — the exact
semantics of BroadcastChannel. Cloning matters: a payload that would throw
`DataCloneError` in a real browser throws here too, instead of passing in tests
and failing in production.

It lives on the `testing` subpath, so a simulation harness never lands in your
production bundle:

```ts
import { MemoryHub } from '@use-everywhere/core/testing';
// or, from the React package:
import { MemoryHub } from 'use-everywhere/testing';
```

```ts
import { createSharedStore } from '@use-everywhere/core';
import { MemoryHub } from '@use-everywhere/core/testing';

it('two tabs converge', async () => {
  const hub = new MemoryHub();
  const options = { transport: () => hub.connect() };

  const tabA = createSharedStore('checkout', { step: 0 }, options);
  const tabB = createSharedStore('checkout', { step: 0 }, options);

  tabA.set('step', 2);
  await new Promise((r) => setTimeout(r, 0)); // drain delivery microtasks

  expect(tabB.getSnapshot().step).toBe(2);
});
```

Each `createSharedStore` call with an injected transport is one simulated
client — call it three times and you have three tabs. Pass `kind: 'worker'`
to simulate a worker peer; that's how you test `scope: 'tabs'` filtering.

:::tip[One tick is enough]
`MemoryHub` delivers on microtasks, so a single `await setTimeout(0)` flushes
every pending message _including_ cascades (hello → snapshot → merge).
:::

## Test React components against a fake "other tab"

For component tests, let the component use the hooks as-is and create the
"other tab" with an explicit real transport (happy-dom implements
BroadcastChannel; jsdom does not):

```tsx
import { BroadcastChannelTransport, createSharedStore } from 'use-everywhere';
import { render, screen, act } from '@testing-library/react';

function otherTab() {
  return createSharedStore(
    'use-everywhere', // the default store name the hooks use
    { count: 0 },
    { transport: (name) => new BroadcastChannelTransport(name) },
  );
}

it('updates when another tab writes', async () => {
  render(<Counter />); // uses useSharedState('count', 0)
  const peer = otherTab();

  act(() => peer.set('count', 41));
  await act(() => new Promise((r) => setTimeout(r, 0)));

  expect(screen.getByText('41')).toBeInTheDocument();
  peer.close();
});
```

Why the explicit transport on the peer? The hooks' registry shares one bus
per name per environment — a second default client in the same test would
_be_ the same client. An explicit transport factory creates an isolated
client: a genuine "other tab" in one process.

One habit that will save you a debugging session: use distinct store names
per test (`{ store: 't1' }`). Registry singletons live for the page — which
in a test runner means the whole test file.

## Testing window flows without windows

`openWindow` and `connectToOpener` accept `localWindow`, `openFn`, `opener`,
and `cid` seams. `fakeWindowPair` from `@use-everywhere/test-utils` gives you
two windows wired to each other — including the parts the handshake exists to
defend against, via `injectMessage` (wrong origin, unrelated source) and
`autoFlush = false` (a child that has not loaded yet). With a pair you can drive
the whole lifecycle synchronously:

```ts
const opened = openWindow(PAY_URL, {
  peerOrigin: PAY_ORIGIN,
  localWindow: fakeOpener, // listens like a Window
  openFn: (url) => ((capturedUrl = url), fakeChild), // "opens" the fake child
});

const conn = connectToOpener({
  peerOrigin: SHOP_ORIGIN,
  opener: fakeOpener,
  localWindow: fakeChild,
  cid: new URL(capturedUrl).searchParams.get('ue-cid')!,
});

conn.finish({ receiptId: 'r-1' });
await expect(opened.result).resolves.toEqual({ receiptId: 'r-1' });
```

This is exactly how the library tests slow-loading children (queueing),
forged messages (origin/nonce/source gates), popup blocking
(`openFn: () => null`), and premature closes — all without a browser window.
The same seams are available to your tests.

For React, `useOpenedWindow(factory)` takes any factory, so tests can return
a hand-rolled fake `OpenedWindow` object with controllable promises and
assert the full status machine: `idle → opening → connected → done`.

## Testing leader election

Leadership is timing, so drive the clock. `createLeader` with an injected
transport is one simulated tab, exactly like the store:

:::caution[Pin the strategy in tests]
`createLeader` picks Web Locks or the heartbeat election from what the runtime
offers, and test runtimes disagree: Node 22 exposes no `navigator.locks`, Node
24 does, and jsdom and happy-dom differ again. A test that drives fake timers
past a lease is describing the **heartbeat** election, so say so — otherwise the
same file asserts two different things depending on where it runs.

```ts
createLeader('feed', { strategy: 'heartbeat', transport: () => hub.connect() });
```

To exercise the Web Locks path deterministically, inject a lock manager with
`locks` rather than relying on the platform providing one.
:::

```ts
import { createLeader } from '@use-everywhere/core';
import { MemoryHub } from '@use-everywhere/core/testing';

it('a joiner adopts the incumbent instead of stealing the seat', async () => {
  vi.useFakeTimers();
  const hub = new MemoryHub();
  const tab = () => createLeader('feed', { strategy: 'heartbeat', transport: () => hub.connect() });

  const first = tab();
  await vi.advanceTimersByTimeAsync(1000); // one heartbeat: it leads
  expect(first.getSnapshot().isLeader).toBe(true);

  const second = tab();
  await vi.advanceTimersByTimeAsync(0); // the incumbent answers at once

  expect(second.getSnapshot().leaderId).toBe(first.clientId);
  expect(first.getSnapshot().isLeader).toBe(true); // the crown did not move
});
```

To test **failover**, don't call `close()` — that resigns, which is the _fast_
path. A real crash is silence. `createScenario` has that as one call:

```ts
const browser = createScenario();
const a = browser.tab();
const survivor = browser.tab().leader('feed');
a.leader('feed');

await browser.settle();
a.crash(); // no goodbye, and the lock the dead tab held is reclaimed
await browser.settle();

expect(survivor.getSnapshot().isLeader).toBe(true);
```

By hand, simulate it with a raw hub connection that claims the seat and then
says nothing:

```ts
const ghost = hub.connect();
ghost.post({
  v: 1,
  scope: 'leader',
  type: 'claim',
  term: [9, 'ghost'],
  clientId: 'ghost',
  kind: 'tab',
});
await vi.advanceTimersByTimeAsync(0);
expect(survivor.getSnapshot().leaderId).toBe('ghost');

await vi.advanceTimersByTimeAsync(4000); // past the 3s lease
expect(survivor.getSnapshot().isLeader).toBe(true);
```

:::caution[Don't use fake timers for the React hooks]
Fake timers, `act()`, and BroadcastChannel's async delivery interact badly.
For `useLeader` component tests, pass short **real** timings instead —
`{ heartbeatMs: 20, leaseMs: 60 }` — and await real `setTimeout`s. The suite
stays fast and you dodge the whole interaction.
:::

Registry singletons live for the page, so give every test its own bus name.

## Testing persistence

Persistence takes an adapter, and an adapter is just three methods — so hand it
a `Map` and assert on exactly what hit the disk:

```ts
import { createSharedStore, webStorageAdapter, type StorageLike } from '@use-everywhere/core';

const map = new Map<string, string>();
const storage: StorageLike = {
  getItem: (k) => map.get(k) ?? null,
  setItem: (k, v) => void map.set(k, v),
  removeItem: (k) => void map.delete(k),
};
```

Seed it to test **restore**. Note that the stored versions are what make the
outcome deterministic — a counter of 3 beats a live tab still at 1:

```ts
map.set('k', JSON.stringify({ v: 1, state: { theme: 'dark' }, versions: { theme: [3, 'old'] } }));

const store = createSharedStore(
  'settings',
  {},
  {
    transport: () => hub.connect(),
    persist: { adapter: webStorageAdapter(storage, 'k') },
  },
);

expect(store.getSnapshot().theme).toBe('dark'); // synchronous: there on the first read
```

Read it back to test **write-through**, remembering the debounce:

```ts
store.set('theme', 'neon');
await vi.advanceTimersByTimeAsync(150); // past debounceMs
expect(JSON.parse(map.get('k')!).state).toEqual({ theme: 'neon' });
```

A key that was only ever _registered_ — someone's `initial`, never written — is
deliberately not persisted, so don't expect to find it there.

## End-to-end, in real tabs

Some things only a browser can prove: that `pagehide` really fires when a tab
closes, that `localStorage` really survives the last one, that a real
`BroadcastChannel` really reaches a real second tab. The repo runs those as
Playwright specs (`pnpm e2e`).

The one rule is **one browser context**:

```ts
test('exactly one tab drives', async ({ context }) => {
  const tabs = [await context.newPage(), await context.newPage(), await context.newPage()];
  for (const tab of tabs) await tab.goto('/');
  // …
});
```

Separate contexts are separate storage partitions — tabs in different contexts
would neither hear each other's broadcasts nor share a disk, and every test
would pass for the wrong reason.

Closing a page fires `pagehide`, so `page.close()` exercises the real handover
path. Measured against the demo, a survivor takes the seat in **well under
100ms**, where the lease alone would have taken 3 seconds — which is the whole
point of resigning on the way out.

## SSR

The hooks read initial values through `getServerSnapshot`, and every engine
falls back to a no-op transport when `BroadcastChannel` does not exist — so
`renderToString` works out of the box and hydration starts from your initial
values. A one-line test keeps you honest:

```tsx
expect(renderToString(<Widget />)).toContain('initial-value');
```

## Where to next

- [Recipes](./recipes.md) — patterns worth wrapping in exactly these kinds
  of tests.
- [`useOpenedWindow`](../hooks/use-opened-window.md) — the status machine
  your fakes will be asserting.
- [How sync works](../under-the-hood/how-sync-works.md) — what "hello →
  snapshot → merge" actually does in that one awaited tick.
