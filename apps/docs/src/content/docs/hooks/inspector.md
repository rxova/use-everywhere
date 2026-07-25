---
title: 'Inspector'
sidebar:
  order: 12
---

Debugging state across five tabs by adding `console.log` to five tabs is
miserable. The Inspector is a floating panel that shows what this tab is saying
and hearing on the bus.

```tsx
import { Inspector } from 'use-everywhere/devtools';

function App() {
  return (
    <>
      <YourApp />
      {import.meta.env.DEV && <Inspector />}
    </>
  );
}
```

It lives on a **subpath**, so it is a separate entry point: if you don't import
it, it isn't in your bundle. Guard it behind your dev flag and it never reaches
production.

It shows:

- **This tab** — its client id, and whether it leads
- **Peers** — the other tabs, windows, and workers alive right now
- **The crown** — who holds the leader seat
- **State** — every key, its value, and its version clock (`3·a1b2c3` means
  counter 3, written by client `a1b2c3`)
- **Wires** — a live log of every message, `→` outbound and `←` inbound

The version column is the useful one. When two tabs disagree about a value, the
clocks tell you which write actually won and who made it.

## Options

```tsx
<Inspector
  name="settings" // which bus to watch (default: the shared one)
  position="bottom-left" // which corner
  limit={100} // how many wires to keep
  defaultOpen // start expanded
  leaseMs={3000} // match your Leader's lease
/>
```

## It doesn't change what it measures

Two details worth knowing, because they're the reason it can be trusted.

It sees **outbound** wires — the ones this tab posts. A `BroadcastChannel`
never echoes to the sender, so the messages your own tab sends are invisible to
anything listening on the transport. They're surfaced by a debug seam inside the
bus, and they are usually the half you actually need.

It **does not join the election**. It never creates a `Leader`, because doing so
would make a tab a candidate that never asked to be one — and mounting one that
opted out would disable candidacy for the whole tab. Instead it reads the crown
out of the wire log it is already watching. Mounting the Inspector cannot change
who leads.

## Without React

The seam underneath is a plain function, so you can watch a bus from anywhere:

```ts
import { observeBus, enableDebug } from 'use-everywhere';

// Log every wire on the default bus to the console.
const stop = enableDebug();

// Or handle them yourself.
observeBus('settings', ({ direction, wire }) => {
  if (wire.scope === 'state') console.log(direction, wire);
});
```

`observeBus` works even for a bus that doesn't exist yet — observe first, create
later.
