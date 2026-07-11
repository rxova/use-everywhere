---
sidebar_position: 1
slug: /
---

# Getting started

**use-everywhere** gives you state and messages that exist in every tab, window,
and worker — with a React API. Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins version
  clocks and a late-joiner handshake, typed pub/sub events, and peer presence.
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

## Where next

- [Shared state](./guides/shared-state.md) — scopes, conflict resolution, late joiners
- [Messages & presence](./guides/messages-and-presence.md) — typed events, who's online
- [Cross-origin payments](./guides/cross-origin-payments.md) — the opened-window flow
- [Core API](/api/core) and [React API](/api/react) — generated from source on every build
