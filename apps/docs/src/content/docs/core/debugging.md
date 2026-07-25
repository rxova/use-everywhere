---
title: "Debugging"
sidebar:
  order: 5
---

The bus will tell you everything crossing it, in both directions, without React.

```ts
import { enableDebug, observeBus, getBusNames } from 'use-everywhere';

const stop = enableDebug(); // log every wire on the default bus
stop(); // and stop
```

```
[use-everywhere:use-everywhere] → state/patch  { key: 'theme', value: 'dark', version: [3, 'a1b2c3'], … }
[use-everywhere:use-everywhere] ← presence/ping { clientId: 'f9e8d7', … }
```

`→` is what this tab said. `←` is what it heard.

## observeBus

```ts
const stop = observeBus('settings', ({ direction, wire }) => {
  if (wire.scope === 'state' && wire.type === 'patch') {
    console.log(direction, wire.key, wire.version);
  }
});
```

Every wire is a discriminated union on `scope` (`'state' | 'presence' | 'event'
| 'leader'`) and `type`, so TypeScript narrows it for you.

Two properties worth relying on:

**It works before the bus exists.** Observers are keyed by name and looked up
when a wire is emitted, not when the bus is built — so you can observe first and
create later. Handy at module scope, before anything has rendered.

**It sees outbound wires.** This is the whole reason the seam exists. A
`BroadcastChannel` never echoes to its own sender, so a listener on the transport
sees only what _other_ tabs said — your own tab is silent to it. `observeBus`
captures posts at the source. When you're asking "did this tab even send that?",
this is the only thing that can answer.

## getBusNames

```ts
getBusNames(); // ['use-everywhere', 'settings']
```

The buses alive on this page. Buses built with an injected transport (tests)
bypass the registry, so they're not listed.

## Options

```ts
enableDebug({
  name: 'settings', // which bus (default: the shared one)
  log: myLogger, // where to write (default: console.log)
});
```

Both `enableDebug` and `observeBus` return an unsubscribe function, and calling
it twice is safe.

## In React

[`<Inspector />`](../hooks/inspector.md) is this, with a UI — peers, the leader,
every key with its version clock, and a live wire log. It's on the
`use-everywhere/devtools` subpath, so it stays out of your bundle unless you
import it.
