---
title: "Recipes"
sidebar:
  order: 4
---

Small, complete patterns you can lift straight into an app. Each one names
the primitive it leans on and _why_ that primitive is the right one — because
picking state vs. message vs. presence is most of the skill here, and these
six cover the choices that come up over and over.

## Log out everywhere

The classic. A logout must reach every tab _currently open_ — a tab opened
tomorrow gets its answer from the session cookie, not from an old event. By
the litmus test, that makes it a **message**, not state:

```tsx
type AuthEvents = { 'logged-out': undefined };
const auth = defineChannel<AuthEvents>('auth');

function useLogoutEverywhere() {
  const send = auth.useSend();

  // Every tab listens…
  auth.useMessage('logged-out', () => {
    window.location.assign('/login');
  });

  // …and any tab can trigger.
  return () => {
    void fetch('/api/logout', { method: 'POST' }).then(() => {
      send('logged-out', undefined);
      window.location.assign('/login'); // messages don't echo to the sender
    });
  };
}
```

Note the last line: channel messages are never delivered back to the sender,
so the initiating tab handles itself explicitly. Forgetting it is the most
common first bug with events.

## The duplicate-tab lock (single-flight)

Stop two tabs from submitting the same payment, export, or wizard. The lock
must survive a tab opening _mid-flight_ — the fresh tab has to render "busy"
from its first frame — so it is **state**:

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
[How sync works](../under-the-hood/how-sync-works.md).

:::caution
This prevents _accidental_ double submission. Anything involving money still
needs a server-side idempotency key — a hostile user has DevTools.
:::

## Live draft that follows the user

A user drafts a message in one tab, opens the same page in another, and
expects the draft to be there. It has to exist for a tab that opens later —
state again, and hydration does literally all the work:

```tsx
function DraftEditor() {
  const [draft, setDraft] = useSharedState('compose-draft', '');
  return <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />;
}
```

Nothing else required: the new tab says `hello`, receives a snapshot, and the
textarea starts full. Remember the value evaporates with the last tab — if
drafts must survive a browser restart,
[persist them separately](../under-the-hood/limitations.md#state-does-not-survive-the-last-tab--unless-you-ask-it-to).

## A worker as a background engine

Move polling or heavy computation into a Web Worker and let every tab render
its output. No worker protocol to design — the worker is just another peer
writing to the same store:

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
each tab that spawns the worker gets its _own_ worker — spawn it from a
single place, or use a `SharedWorker` where support allows.

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
the demo app ships: the duplicate-tab payment problem, handled in about
twenty lines.

## One socket, not five

Every open tab opening its own WebSocket is the classic multi-tab bug. Elect
one tab to hold the connection, and let the rest read what it writes:

```tsx
import { useLeaderEffect, useSharedState } from 'use-everywhere';

function useLivePrices() {
  const [prices, setPrices] = useSharedState<Record<string, number>>('prices', {});

  useLeaderEffect(() => {
    const socket = new WebSocket('wss://example.com/prices');
    socket.onmessage = (e) => setPrices(JSON.parse(e.data));
    return () => socket.close();
  });

  return prices; // every tab reads it; exactly one tab fetched it
}
```

The leader writes to shared state, so followers render the same data without a
connection of their own. When the leading tab closes, another picks the socket
up within a heartbeat.

Keep throttled background tabs out of the running if reconnecting is expensive:

```tsx
useLeader({ eligible: !document.hidden });
```

## Refresh the auth token exactly once

Same shape, higher stakes. Five tabs racing to refresh one token means four
wasted round trips and, with a rotating refresh token, four invalidated
sessions:

```tsx
function TokenRefresher() {
  const [token, setToken] = useSharedState<string | null>('token', null);

  useLeaderEffect(() => {
    const id = setInterval(async () => setToken(await refresh()), 10 * 60_000);
    return () => clearInterval(id);
  });

  return null; // mount once, anywhere
}
```

Every tab reads `token` from shared state; one tab does the refreshing. Note the
caveat: leadership is [advisory](../under-the-hood/limitations.md#leadership-is-advisory-not-a-distributed-lock),
so if refreshing twice is genuinely harmful, your endpoint still needs to be
idempotent.

## A draft that survives closing the last tab

`useSharedState` keeps a draft in sync across tabs, but it dies with the last
one. Give the store a disk and it comes back:

```tsx
import { defineStore, localStorageAdapter } from 'use-everywhere';

const drafts = defineStore<{ body: string }>('drafts', {
  persist: localStorageAdapter('app:drafts'),
  persistDebounceMs: 250,
});

function Composer() {
  const [body, setBody] = drafts.useSharedState('body', '');
  return <textarea value={body} onChange={(e) => setBody(e.target.value)} />;
}
```

Type in one tab, watch it appear in the other, close both, reopen — the text is
there on the first paint. The stored value carries its version clock, so if a
live tab has moved on since you last closed, the live tab still wins. See
[defineStore](../hooks/define-store.md).

## See what the tabs are saying

When two tabs disagree and you cannot work out why, stop adding `console.log`
to five tabs:

```tsx
import { Inspector } from 'use-everywhere/devtools';

{
  import.meta.env.DEV && <Inspector defaultOpen />;
}
```

The version column is the one to read: `3·a1b2c3` means counter 3, written by
client `a1b2c3`. When a write appears to vanish, it lost the last-writer-wins
race — and the clocks tell you to whom.

## Where to next

- [Hooks](../hooks/overview.md) — the full reference behind every hook these
  recipes use.
- [Testing](./testing.md) — assert these patterns with simulated tabs, no
  browser needed.
- [Limitations](../under-the-hood/limitations.md) — the boundaries the
  recipes are designed around.
