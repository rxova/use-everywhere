---
sidebar_position: 5
---

# Testing

Cross-tab behavior sounds hard to test — real BroadcastChannel needs a real
origin, and `window.open` needs a real window. The library is built so that
neither is true in practice: **every engine accepts an injected transport, and
the window channel accepts injected windows.** The same seams the library's
own 88-test suite uses are public API.

## Simulating many tabs in one test: `MemoryHub`

A `MemoryHub` is an in-process stand-in for the browser's channel: every
transport connected to it receives every _other_ transport's posts,
asynchronously, with no self-echo — the exact semantics of BroadcastChannel.

```ts
import { createSharedStore, MemoryHub } from '@use-everywhere/core';

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
client — call it three times and you have three tabs. Passing `kind:
'worker'` simulates a worker peer, which is how you test `scope: 'tabs'`
filtering.

:::tip One tick is enough
`MemoryHub` delivers on microtasks, so a single `await setTimeout(0)` flushes
every pending message _including_ cascades (hello → snapshot → merge).
:::

## Testing React components

Point the "other tab" at a real `BroadcastChannelTransport` and let your
component use the default registry (happy-dom implements BroadcastChannel;
jsdom does not):

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

Why the explicit transport on the peer? The hooks' registry shares one bus per
name per environment — a second default client in the same test would _be_ the
same client. An explicit transport factory creates an isolated client: a
genuine "other tab" in one process.

Use distinct store names per test (`{ store: 't1' }`) — registry singletons
live for the page, i.e. for the whole test file.

## Testing window flows without windows

`openWindow` and `connectToOpener` accept `localWindow`, `openFn`, `opener`,
and `cid` seams. A fake window pair is ~40 lines (see
`packages/core/src/__tests__/helpers/fake-window.ts` for the reference
implementation the library itself uses); with one you can drive the whole
lifecycle synchronously:

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

This is how the library tests slow-loading children (queueing), forged
messages (origin/nonce/source gates), popup blocking (`openFn: () => null`),
and premature closes — all without a browser window.

For React, `useOpenedWindow(factory)` takes any factory, so tests can return a
hand-rolled fake `OpenedWindow` object with controllable promises and assert
the full status machine: `idle → opening → connected → done`.

## SSR

The hooks read initial values through `getServerSnapshot`, and every engine
falls back to a no-op transport when `BroadcastChannel` does not exist — so
`renderToString` works out of the box and hydration starts from your initial
values. A one-line test keeps you honest:

```tsx
expect(renderToString(<Widget />)).toContain('initial-value');
```
