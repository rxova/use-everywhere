---
title: 'leader-effect-captures'
sidebar:
  order: 5
---

**Recommended: warn.** Flags values declared in a component that a
`useLeaderEffect` callback reads.

## Why

`useLeaderEffect` runs when this tab takes the seat and tears down when it loses
it. That is the whole contract, and its dependency list is exactly
`[isLeader]` — deliberately, because depending on the callback's identity would
reconnect an inline arrow's WebSocket on every render.

The consequence: whatever the effect reads is read at the moment leadership
arrived, and nothing re-runs it when that value changes.

```tsx
function Chat({ roomId }) {
  // ✗ Connected to whichever room was mounted when this tab became leader.
  useLeaderEffect(() => connect(roomId));
}
```

Navigate to another room and the leader stays on the old socket. Every other tab
looks correct — they are not the leader, so they never ran the effect at all —
which makes this one of the harder bugs to reproduce.

## Correct

A ref is the escape hatch: stable box, current value.

```tsx
function Chat({ roomId }) {
  const roomRef = useRef(roomId);
  useEffect(() => {
    roomRef.current = roomId;
  });

  useLeaderEffect(() => {
    const socket = connect(roomRef.current);
    return () => socket.close();
  });
}
```

If the effect genuinely has to restart when the value changes, the value belongs
in shared state, or the work belongs in a plain `useEffect` guarded by
`useIsLeader()` — which does re-run on its own dependencies.

## What is exempt

- Anything from module scope or an import: stable by construction.
- `useRef` results.
- The setter half of `useState`, `useReducer`, `useSharedState` and
  `useSharedReducer` — stable by contract.
- The registry getters and channel hooks (`useChannel`, `useSend`, `useAsk`,
  `getSharedStore`, `getLeader`, `getChannel`): they return the one instance
  registered for a name.

## When not to use it

A value that never changes after mount — a config object built once in the
component — is captured harmlessly, and the rule cannot tell. That is why it
warns rather than errors. Hoist the value out of the component, or turn the rule
off for the file, whichever is more honest.
