---
title: 'Bugs you already have'
description: 'Five tabs, one expired token, five refresh calls. The multi-tab bugs already in your app, and which primitive fixes each one.'
sidebar:
  order: 1
---

A user has your app open in five tabs. Their access token expires. Five tabs
notice within the same second, five tabs call `/refresh`, and if you rotate
refresh tokens — which you should — the first call consumes the token and the
other four come back invalid. The user is signed out, hard, for the crime of
leaving tabs open.

You will not reproduce that on your machine. You have one tab open. It shows up
in production, intermittently, from users who cannot tell you what they did, and
it gets closed as _cannot reproduce_.

That is the shape of every bug on this page. They are all the same mistake, made
once and inherited everywhere: **the tab is not the unit of a session — the
browser is.** Your auth, your socket, your cache and your checkout all belong to
the person, and you have been scoping them to a tab because that is where
`useState` lives.

Here are the five that cost the most. If two or more look familiar, the rest of
these docs are worth your afternoon.

## 1. The sign-out that only signs out one tab

**What the user sees.** They sign out in one tab. The other four keep showing
their inbox — real data, on screen, after logging out — until something happens
to 401. On a shared laptop that is not an annoyance, it is the whole reason they
signed out.

**Why it happens.** Signing out cleared memory in the tab that did it. The other
tabs have their own copy of everything and no reason to look again.

**The fix.** One message, and every tab finds out in the same millisecond.

```tsx
type Session = { 'signed-out': { reason: string } };

const channel = useChannel<Session>('session');

useOnMessage(channel, 'signed-out', ({ reason }) => {
  queryClient.clear();
  navigate(`/login?reason=${reason}`);
});

// in your sign-out handler
useSend(channel)('signed-out', { reason: 'you signed out' }, { echo: true });
```

`echo: true` is doing real work there. A post does not come back to the sender —
same as a raw `BroadcastChannel` — so without it the tab that signed out is the
one tab that never runs the handler. With it, one handler serves every tab
including this one, and you delete the duplicate cleanup code you would
otherwise write beside the button.

## 2. The token refresh stampede

**What the user sees.** The story at the top. Random, total sign-outs that
correlate with nothing in your logs except a burst of `/refresh` calls
milliseconds apart.

**Why it happens.** Every tab runs the same expiry timer. Nothing tells them
they are five copies of one session, so all five do the work.

**The fix.** Exactly one tab refreshes; the result is shared.

```tsx
const [token, setToken] = useSharedState<Token | null>('token', null);

useLeaderEffect(() => {
  const timer = setInterval(async () => {
    setToken(await refresh());
  }, FOUR_MINUTES);
  return () => clearInterval(timer);
});
```

`useLeaderEffect` runs in one tab and tears down the moment that tab loses the
seat — including when it is killed rather than closed, because on a secure
origin the seat is a Web Lock and the browser releases it when the tab dies.
Every other tab reads the new token from shared state.

Two honest notes. The token now sits in every tab's memory, which sounds worse
than it is: they are one origin, and any script that can read it in one tab can
already read it in all of them. And leadership here is _advisory_ — good for
"don't refresh five times", not a distributed lock. If two refreshes would be a
security event rather than a nuisance, the server has to be the one saying no.

## 3. Five tabs, five WebSockets

**What you see.** Your connection count is a multiple of your user count.
Mobile users report battery drain. Somebody eventually hits the per-origin
connection limit and the sixth tab silently never connects.

**Why it happens.** The socket is opened by a component, and the component is in
every tab.

**The fix.** One tab owns the socket and relays what it hears.

```tsx
const channel = useChannel<{ event: ServerEvent }>('server-events');
const post = useSend(channel);

useLeaderEffect(() => {
  const socket = new WebSocket(URL);
  socket.onmessage = (message) => post('event', JSON.parse(message.data), { echo: true });
  return () => socket.close();
});

useOnMessage(channel, 'event', applyServerEvent);
```

Six connections become one. When the owning tab goes away the socket moves —
under 100ms on a clean close, because a tab that closes resigns on its way out
rather than leaving the others to wait out a lease.

The `echo: true` again: the leader needs to apply its own relayed events through
the same path as everyone else, or you end up maintaining two code paths that
must agree forever.

## 4. Stale lists in the tab that did not do the editing

**What the user sees.** They edit an invoice in tab A. Tab B still shows the old
row, and will keep showing it until it happens to refetch or they reload. Then
they edit it in tab B, from stale data, and overwrite what they just did.

**Why it happens.** Cache invalidation is scoped to the client that performed the
mutation. Every other tab has its own cache and no idea anything changed.

**The fix.** Broadcast the invalidation.

```tsx
const channel = useChannel<{ invalidate: { key: string } }>('cache');
const post = useSend(channel);

useOnMessage(channel, 'invalidate', ({ key }) => {
  queryClient.invalidateQueries({ queryKey: [key] });
});

// after a successful mutation
post('invalidate', { key: 'invoices' });
```

No echo this time, and the difference is worth noticing: your mutation's own
`onSuccess` already invalidated this tab. Echoing would refetch twice. The
question to ask at every `post` is whether the sending tab has already done the
work locally.

## 5. Paying twice

**What the user sees.** A charge they did not intend, or a checkout that hangs
forever because they closed the payment window and nothing was listening for
that.

**Why it happens.** Two failures wearing one coat. Same-origin, two tabs can
both reach a Pay button that only one of them should be allowed to press.
Cross-origin, the payment window is on a different origin, so the only channel
you have is `postMessage` — and a raw `postMessage` listener will happily accept
a message from any window that knows your page is listening.

**The fix.** For the same-origin half, leadership or a shared status flag, the
way [Why this exists](./why.md) walks through. For the cross-origin half, a
handshake that already does the checks:

```tsx
const payment = useWindowResult(() =>
  openWindow('https://pay.example.com/checkout', {
    peerOrigin: 'https://pay.example.com',
  }),
);

if (payment.status === 'done') return <Receipt id={payment.result.receiptId} />;
if (payment.status === 'error') return <Retry error={payment.error} />;
```

Origin validation, an envelope brand, a per-session nonce, `event.source`
checking, queueing for a child that has not loaded yet, and detecting the window
being closed mid-flow — all of that is the difference between the two-line
version and a correct one, and all of it is the same in every app that does it.
The [cross-origin payments guide](../guides/cross-origin-payments.md) has the
threat model.

## Where this is the wrong tool

Being honest about the boundary is cheaper for both of us than a support thread
later.

- **One writer, no conflicts.** If exactly one tab ever writes a value, twelve
  lines of `BroadcastChannel` is genuinely the right answer. Use the platform.
- **Anything that must reach another device.** This is one browser profile on
  one machine. It will not reach the user's phone, their other browser, or a
  colleague. That needs a server, and no amount of clever client code changes
  it.
- **Multi-user presence.** "Who else is viewing this ticket" means other people,
  which means a server. `usePeers` answers "how many of _my own_ tabs", which is
  a smaller and more useful claim than the word presence usually implies.
- **Collaborative editing.** Two people typing in one paragraph needs a CRDT —
  Yjs, Automerge, or a service. [`useSharedReducer`](../guides/counters-and-reducers.md)
  is the stated ceiling here: it makes commutative operations safe, and stops
  there.

## The rule worth keeping

Before you write the next piece of coordination code, ask two questions about
the work in front of you:

**Which tab owns this?** If the answer is "all of them" and it costs money,
sockets, or requests, that is a leadership problem.

**What should a tab opened thirty seconds from now see?** If the answer is
"whatever it happens to have", that is a shared-state problem — and a message
alone will not fix it, because messages have no history.

Everything in this library is one of those two answers, made routine. The next
page explains why the browser leaves them to you in the first place, and
[the playground](./playground.md) lets you cause all of this on purpose in a
page full of real tabs.
