---
title: "Getting started"
sidebar:
  order: 1
---

**use-everywhere** is `useState`, except the value exists in every tab,
window, and worker on your origin at once. It exists because the browser's
cross-tab APIs are good but low-level, and there was no `useState`-shaped
way to use them — the full reasoning is in [Why this exists](./why.md). The
pitch fits in one sentence:

:::tip The promise
One object. Every tab. Writes anywhere show up everywhere, tabs opened later
see the current value, and simultaneous writes don't split-brain.
:::

Let's get a value living in every tab in about two minutes.

## Install

```bash
pnpm add use-everywhere        # React hooks (re-exports the full core)
# or: npm i use-everywhere / yarn add use-everywhere
```

If you're not using React, `@use-everywhere/core` is the same engine with no
framework attached — everything in these docs that isn't a hook lives there.

## Make a counter that doesn't live in one tab

Swap `useState` for `useSharedState` and give the value a key:

```tsx title="Counter.tsx"
import { useSharedState, usePeers } from 'use-everywhere';

function Counter() {
  // useState, but the value exists in every tab on this origin.
  const [count, setCount] = useSharedState('count', 0);
  const peers = usePeers();

  return (
    <button onClick={() => setCount((c) => c + 1)}>
      {count} — seen by {peers.length} other tabs
    </button>
  );
}
```

Same shape as `useState`: a value, a setter, updater functions work. There's
no Provider to wrap and no store to configure — the key `'count'` _is_ the
identity, and any component in any tab that uses it shares the value. (Why no
Provider? A BroadcastChannel is already global to the origin; a React context
couldn't scope it any further. More in
[the mental model](./mental-model.md).)

## Open a second tab

This is the whole payoff, so actually do it:

1. Run your app and open it in two tabs, side by side.
2. Click the button in either tab — **both** render the new count within a
   few milliseconds.
3. Click both buttons as fast as you can. The counts never disagree: every
   write carries a version clock, and all tabs deterministically pick the
   same winner.
4. Now open a _third_ tab. It renders the current count from its very first
   paint — not `0` — because new tabs ask their peers for a snapshot before
   trusting the initial value.

That third step is the one that kills real bugs. A tab opened mid-payment
seeing `'processing'` instead of `'idle'` is exactly the difference between
one charge and two.

## Which hook do I want?

| You are asking…                                       | Reach for                                          | Because                                               |
| ----------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| "What is the current value?"                          | [`useSharedState`](../hooks/use-shared-state.md)   | Convergent, hydrates late joiners, survives tab churn |
| "What just happened?"                                 | [`useMessage`](../hooks/use-message.md)            | Fire-and-forget events; no history, no cleanup        |
| "Who else is here?"                                   | [`usePeers`](../hooks/use-peers.md)                | Live peer list via heartbeats                         |
| "How do I hear back from a window on another domain?" | [`useOpenedWindow`](../hooks/use-opened-window.md) | Validated 1:1 postMessage channel with a result       |

When you're torn between the first two, use this test:

:::tip The litmus test
If a tab opened later needs to know it, it's **state**. If only
currently-open tabs care, it's an **event**.
:::

Payment status: state. "Session renewed, restart your timers": event.

## See the whole thing running

The repo's demo app shows every feature on one screen — synced counter and
note, presence dots, a worker feeding data, and a real cross-origin payment
window (it opens `127.0.0.1` from `localhost`, which the browser treats as
genuinely different origins):

```bash
git clone https://github.com/rxova/use-everywhere && cd use-everywhere
pnpm install && pnpm build && pnpm dev
```

Open `http://localhost:5173` in two tabs and click around.

## Where to next

- [Why this exists](./why.md) — the bug that keeps coming back, and what we
  all hand-roll today instead of this library.
- [The mental model](./mental-model.md) — two ideas that make the whole API
  predictable. Read this one even if you skip the rest.
- [Hooks](../hooks/overview.md) — every hook in plain English, with all the
  options and examples.
- [Guides](../guides/shared-state.md) — task-shaped walkthroughs: shared
  state, messages, payments, recipes, testing.
- [Under the hood](../under-the-hood/how-sync-works.md) — version clocks,
  handshakes, and the security model, for when you want to reason about edge
  cases.
