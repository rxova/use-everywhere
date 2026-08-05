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

## Reading a log that will not sit still

Three controls, because a live log is unreadable at exactly the moment it
matters:

- **pause** freezes the log — and only the log. The panel keeps observing
  (unsubscribing would leave a hole rather than a pause) and the crown keeps
  updating, because leadership is state rather than history.
- **clear** empties it, so the next thing you do is the only thing on screen.
- **filter** matches on `scope/type` and on the sender: `leader` for the
  election, `state` for writes, or the first characters of a client id to watch
  one tab. The heading says how much is hidden — `Wires (3 of 41)` — rather than
  pretending the rest is not there.

- **scope** narrows to one kind of traffic — `state`, `leader`, `presence`,
  `channel`, or `all`. The filter still applies on top, so `leader` + `a1b2` is
  "the election, as seen from that tab".

## Editing state

Click a value to edit it. Type JSON, press **Enter** to write it, **Escape** to
abandon it.

The write goes **through the store**, so it takes a version and travels to every
tab, exactly as your own code's write would. That is the only edit worth having:
one that changed a value only in the panel would be a lie the moment any peer
looked.

JSON, strictly. `"light"` is the string and `light` is a mistake — refused and
marked, not guessed at, because guessing is how a debugger starts disagreeing
with the wire it is showing you.

## Going back to a state you had

Every `state` wire records a frame: the store's keys as they were once that wire
was applied. The **Timeline** lists them, and **restore** puts one back.

Restoring is a **write**, not a rewind. Each key that differs is set through the
store, takes a fresh version, and goes on the wire — so every tab converges on
the restored value instead of one tab quietly disagreeing with the rest. Nothing
in the log is undone, which is why the button says restore.

Two consequences worth stating:

- **Keys the frame never saw are left alone.** A frame from before a key existed
  does not delete it; removing a key other tabs are using is a bigger claim than
  a devtool should make from a picture of the past.
- **The frame is state, not history.** Restoring twice is idempotent, and
  restoring an old frame does not un-happen what came after it.

## Isolated from your CSS

The panel renders inside a **shadow root**. Its styles were always scoped under
`.ue-ins`, which is only half the problem: the panel could not leak out, but
every reset, `!important`, and framework preflight in the host page leaked in. A
devtool that looks different depending on whose app it is mounted in is one you
cannot trust when it looks wrong.

One consequence, if your own tests assert on the panel: it is not in `document`.
Reach it through the host.

```ts
const host = screen.getByTestId('ue-inspector-host');
const panel = within(host.shadowRoot as unknown as HTMLElement);
```

It also renders **nothing on the server** — no DOM there to attach a shadow root
to, and devtool markup in server HTML was never useful to anyone. There is
nothing to mismatch on hydration.

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
