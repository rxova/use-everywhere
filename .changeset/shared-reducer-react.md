---
'use-everywhere': minor
---

Add `useSharedReducer` — `useReducer`, with every tab applying the same actions in the same order.

```tsx
const [count, dispatch] = useSharedReducer((n, action) => n + action.by, 0);
<button onClick={() => dispatch({ by: 1 })}>{count}</button>;
```

Reach for it whenever a write is _relative to what is already there_ — a counter, a running total, a list you append to. `useSharedState` converges last-writer-wins on the value, so two tabs incrementing at once both write the same result and one increment vanishes. For a plain register — theme, selection, draft — `useSharedState` is still the right tool and the cheaper one.

The reducer shares this tab's existing leader rather than electing a second one, `dispatch` keeps a stable identity so it is safe in a dependency array, and several reducers coexist on one bus by `key`.

Server renders get an inert double: the initial value, and a `dispatch` that does nothing. A server has no peers to order actions with, so producing a value the browser is about to disagree with would be a hydration mismatch by construction.

**The first caller's reducer wins** for the life of the page. A re-render passes a new function identity every time, and swapping the fold under a history already applied is exactly the divergence an ordered reducer exists to prevent.

New **Counters and reducers** guide covers when to reach for which primitive, and what the ordering does and does not promise.
