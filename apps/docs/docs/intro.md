---
sidebar_position: 1
slug: /
---

# Getting started

**use-everywhere** gives you state and messages that exist in every tab,
window, and worker — with a React API. Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins
  version clocks and a late-joiner handshake, typed pub/sub events, and peer
  presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened — e.g. a payment page on another domain that must report
  back to the checkout that opened it.

## Install

```bash
pnpm add use-everywhere        # React hooks (re-exports the full core)
pnpm add @use-everywhere/core  # framework-agnostic engine only
```

## Sixty seconds

```tsx
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

Open the page twice: both tabs render the same count, clicks converge, and a
tab opened later hydrates to the current value instantly.

## Which primitive do I want?

| You are asking…                                       | Reach for                                                             | Because                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| "What is the current value?"                          | [`useSharedState`](./guides/shared-state.md)                          | Convergent, hydrates late joiners, survives tab churn   |
| "What just happened?"                                 | [`useMessage`](./guides/messages-and-presence.md)                     | Fire-and-forget events; no history, no cleanup          |
| "Who else is here?"                                   | [`usePeers`](./guides/messages-and-presence.md#who-else-is-here)      | Live peer list via heartbeats                           |
| "How do I hear back from a window on another domain?" | [`openWindow` / `useOpenedWindow`](./guides/cross-origin-payments.md) | Validated 1:1 postMessage channel with a result promise |

Litmus test for the first two: **if a tab opened later must know it, it is
state; if only currently-open tabs care, it is a message.**

## Learn it properly

Twenty minutes of reading, in order:

1. [The mental model](./concepts/mental-model.md) — one object in every tab,
   two trust worlds, and what a channel _name_ really is. Read this one even
   if you skip the rest.
2. [How sync works](./concepts/how-sync-works.md) — version clocks,
   convergence, and the handshakes, with diagrams.
3. [Security model](./concepts/security-model.md) — the four gates on every
   cross-origin message, and why shared state stops at the origin line.
4. [Limitations & FAQ](./limitations.md) — what this library refuses to be,
   and what to use instead there.

## Do it now

- [Shared state](./guides/shared-state.md) — scopes, stores, imperative access
- [Messages & presence](./guides/messages-and-presence.md) — typed events, peer lists
- [Cross-origin payments](./guides/cross-origin-payments.md) — the full opened-window flow
- [Recipes](./guides/recipes.md) — logout-everywhere, duplicate-tab lock, worker engines
- [Testing](./guides/testing.md) — simulate tabs with `MemoryHub`, windows with fakes
- [Core API](/api/core) / [React API](/api/react) — generated from source on every build
