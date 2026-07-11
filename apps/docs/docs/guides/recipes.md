---
sidebar_position: 4
---

# Recipes

Small, complete patterns you can lift into an app. Each one names the
primitive it leans on and why that primitive is the right one.

## Log out everywhere

A logout must reach every tab _currently open_ — a tab opened tomorrow gets
its answer from the session cookie, not from an old event. That makes it a
**message**, not state:

```tsx
type AuthEvents = { 'logged-out': undefined };

function useLogoutEverywhere() {
  const channel = useChannel<AuthEvents>('auth');

  // Every tab listens…
  useMessage(channel, 'logged-out', () => {
    window.location.assign('/login');
  });

  // …and any tab can trigger.
  return () => {
    void fetch('/api/logout', { method: 'POST' }).then(() => {
      channel.post('logged-out', undefined);
      window.location.assign('/login'); // messages don't echo to the sender
    });
  };
}
```

Note the last line: channel messages are never delivered back to the sender,
so the initiating tab must handle itself explicitly.

## The duplicate-tab lock (single-flight)

Stop two tabs from submitting the same payment, export, or wizard. This must
survive a tab opening mid-flight, so it is **state**:

```tsx
function useSingleFlight(key: string) {
  const [status, setStatus] = useSharedState<'idle' | 'busy' | 'done'>(key, 'idle');
  const clientId = useClientId();
  const [owner, setOwner] = useSharedState<string | null>(`${key}:owner`, null);

  const run = async (work: () => Promise<void>) => {
    if (status !== 'idle') return;
    setStatus('busy');
    setOwner(clientId);
    try {
      await work();
      setStatus('done');
    } catch {
      setStatus('idle'); // release the lock on failure
      setOwner(null);
    }
  };

  return { status, mine: owner === clientId, run };
}
```

Every tab renders from the same `status`, so the button disables everywhere
the instant one tab starts. Two clicks in the same millisecond? The version
clock picks one deterministic winner — see
[How sync works](../concepts/how-sync-works.md).

:::caution
This prevents _accidental_ double submission. Anything involving money still
needs a server-side idempotency key.
:::

## Live draft that follows the user

A user drafts a message in one tab, opens the same page in another, and
expects the draft to be there. State, with hydration doing all the work:

```tsx
function DraftEditor() {
  const [draft, setDraft] = useSharedState('compose-draft', '');
  return <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />;
}
```

Nothing else required: the new tab posts `hello`, receives a snapshot, and the
textarea starts full. Remember the value evaporates with the last tab — if
drafts must survive a browser restart, persist them separately.

## A worker as a background engine

Move polling or heavy computation into a Web Worker and let every tab render
its output. The worker is just another peer:

```ts title="price-worker.ts"
import { createSharedStore } from '@use-everywhere/core';

const store = createSharedStore('prices', { ticker: {} }, { kind: 'worker' });

setInterval(async () => {
  store.set('ticker', await fetchPrices());
}, 5_000);
```

```tsx title="Prices.tsx"
const [ticker] = useSharedState('ticker', {}, { store: 'prices' });
```

Because the worker announces `kind: 'worker'`, presence can show it (square
dot in the demo) and any store scoped to `'tabs'` will ignore it. One caveat:
each tab that spawns the worker gets its _own_ worker — spawn it from a single
place, or use a `SharedWorker` where support allows.

## "You have this open in another tab"

Presence, verbatim:

```tsx
function DuplicateTabBanner() {
  const peers = usePeers();
  const tabs = peers.filter((p) => p.kind === 'tab');
  if (tabs.length === 0) return null;
  return <Banner>This page is open in {tabs.length} other tab(s).</Banner>;
}
```

Peers appear within a heartbeat (≤2s, instantly if they say hello) and
disappear on close (`bye`) or after ~5s of silence (crash).

## Cross-origin checkout, minimal

The full walkthrough lives in
[Cross-origin payments](./cross-origin-payments.md); the skeleton is:

```tsx
const pay = useOpenedWindow<ToPayment, FromPayment, Receipt>(() =>
  openWindow('https://pay.example.com/checkout', {
    peerOrigin: 'https://pay.example.com',
  }),
);
// pay.open() in a click handler → pay.status / pay.result drive the UI
```

Combine it with the single-flight lock above and the payment button locks in
every tab while one tab's window is open — that combination is exactly what
the demo app ships.
