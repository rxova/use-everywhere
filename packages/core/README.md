# @use-everywhere/core

Framework-agnostic engine for cross-tab shared state, typed events, peer
presence, and secure cross-origin window channels. Zero dependencies.

```bash
npm i @use-everywhere/core
```

> Using React? Install [`use-everywhere`](https://www.npmjs.com/package/use-everywhere)
> instead — it provides hooks and re-exports this entire package.

Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins
  version clocks and a late-joiner handshake, typed pub/sub events, and peer
  presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened. Every message is validated by origin, envelope brand, a
  per-connection nonce, and the source window.

## Shared state

One object that exists in every tab, window, and worker on your origin.
Writes broadcast patches; replicas converge last-writer-wins; tabs opened
later hydrate to the current value via a hello/snapshot handshake.

```ts
import { createSharedStore } from '@use-everywhere/core';

const store = createSharedStore('checkout', { step: 0, payment: 'idle' });

// Imperative writes through the proxy — they sync everywhere:
store.state.step++;

// Or explicit (supports functional updates):
store.set('payment', 'processing');
store.set('step', (prev) => prev + 1);

// React to changes from any tab, worker, or this one:
store.subscribe((key, value, meta) => {
  console.log(`${String(key)} = ${value}`, meta.self ? '(me)' : `(peer ${meta.clientId})`);
});

// Immutable snapshot, replaced per change (useSyncExternalStore-compatible):
store.getSnapshot(); // { step: 1, payment: 'processing' }
```

Options let you delimit what a store accepts — e.g. ignore writes coming from
workers:

```ts
createSharedStore('ui', { theme: 'light' }, { accept: (meta) => meta.kind !== 'worker' });
```

## Typed events

Fire-and-forget messages between contexts. No history: a tab that joins later
never sees old events (use shared state for anything a late joiner must know).

```ts
import { createChannel } from '@use-everywhere/core';

type AuthEvents = { 'logged-out': undefined; 'session-renewed': { expiresAt: number } };

const channel = createChannel<AuthEvents>('auth');

const off = channel.on('logged-out', (_payload, meta) => {
  console.log(`tab ${meta.clientId} logged out`);
  window.location.assign('/login');
});

channel.post('logged-out', undefined); // delivered to every OTHER context
```

## Presence

Who else is on this origin right now? Heartbeat-based, with instant goodbyes
on clean tab closes and pruning (~5s) for crashed ones.

```ts
import { createPresence } from '@use-everywhere/core';

const presence = createPresence('app');
presence.subscribe(() => {
  console.log(presence.getPeers()); // [{ id: 'p8m1q4', kind: 'tab', lastSeen: … }]
});
```

## Cross-origin window channel

The case BroadcastChannel cannot do: a checkout on domain A opens a payment
page on domain B, and the payment page must report back.

```ts
// On the opener (https://shop.example.com):
import { openWindow } from '@use-everywhere/core';

type ToPayment = { order: { orderId: string; amount: string } };
type FromPayment = { progress: { step: string } };
type Receipt = { receiptId: string; last4: string };

const opened = openWindow<ToPayment, FromPayment, Receipt>(
  'https://pay.example.com/checkout',
  { peerOrigin: 'https://pay.example.com' }, // required — '*' throws
);

opened.post('order', { orderId: '48-291', amount: '$69.03' }); // queued until the child is ready
opened.on('progress', ({ step }) => console.log('payment step:', step));

const receipt = await opened.result; // the child's finish() value
// rejects with WindowClosedError if the user closes the window first
```

```ts
// On the opened page (https://pay.example.com):
import { connectToOpener } from '@use-everywhere/core';

const conn = connectToOpener<ToPayment, FromPayment, Receipt>({
  peerOrigin: 'https://shop.example.com',
});

conn.on('order', (order) => showOrderSummary(order)); // your UI code
conn.finish({ receiptId: 'r-123', last4: '4242' }); // resolves the opener's `result`
conn.close();
```

The handshake retries until the (possibly slow-loading) child connects, and
both sides queue outgoing messages until then — nothing is dropped. Every
received message must pass four gates: exact origin, library envelope, a
per-connection nonce carried in the child URL, and (on the opener) the source
window itself.

## Testing

Every engine accepts an injected transport, so "many tabs" fits in one test —
no browser required:

```ts
import { createSharedStore, MemoryHub } from '@use-everywhere/core';

const hub = new MemoryHub();
const tabA = createSharedStore('t', { n: 0 }, { transport: () => hub.connect() });
const tabB = createSharedStore('t', { n: 0 }, { transport: () => hub.connect() });

tabA.set('n', 1);
await new Promise((r) => setTimeout(r, 0));
tabB.getSnapshot().n; // 1
```

`openWindow`/`connectToOpener` take equivalent seams (`openFn`, `localWindow`,
`opener`, `cid`) for driving window flows with fakes.

## Design notes

- **Shared state never crosses origins.** Two origins are two trust domains;
  the cross-origin channel is explicit, per-message, and typed.
- Values must survive structured clone (no functions, DOM nodes, class
  instances).
- State lives exactly as long as some context holds it — nothing is persisted.
- SSR-safe: without `BroadcastChannel`, engines fall back to a local no-op
  transport.

📖 **[Documentation](https://rxova.github.io/use-everywhere/)** — mental
model, how sync works, security model, recipes, and generated API reference.
Source and demo app (with a real cross-origin payment flow):
[github.com/rxova/use-everywhere](https://github.com/rxova/use-everywhere)

## License

MIT
