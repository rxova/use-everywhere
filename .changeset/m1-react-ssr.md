---
'use-everywhere': minor
---

Make the hooks safe on a server, and make the API's silent conflicts loud.

- **SSR is inert.** Every hook called `getStore`/`getPresence`/`getLeader` in the render body, so rendering on a server opened transports, armed presence heartbeats, and ran a _leader election_ on `setInterval`s nothing ever cleared — one leak per name, per process, for the life of a Next.js server. The registry now hands back inert doubles when there is no `window`; the real engines are still built on the client, on first use.
- **`useClientId` no longer breaks hydration.** It returned a per-environment random id straight from render, so the server's markup could never match the browser's. It now reads through `useSyncExternalStore` with a constant empty-string server snapshot, which React reuses for the hydrating render. Treat `''` as "not known yet"; the real id arrives in the commit immediately after.
- **`defineStore` survives Fast Refresh.** Re-registering the same configuration used to throw, so every hot edit of the defining module broke dev. An identical redefinition is now a no-op, and only a genuinely different one warns.
- **`useOpenedWindow` returns a discriminated union.** `status` now narrows `result` and `error` — `status === 'done'` gives `result: R` with no non-null assertion, and `closed-early` types `error` as `WindowClosedError`. `OpenedWindowState` and `OpenedWindowControls` are exported. The hook also no longer writes a ref during render, which is unsafe under concurrent rendering, and status/result/error move as one state object so no render can observe a torn combination.
- **Dev warnings** for two conflicts that were silent: one key registered with two different initial values (first wins, second discarded), and a second `useLeader`/`getLeader` call asking for election timings that are ignored because the first call fixed them.

Documented at the API: `useSharedState`'s convergence is last-writer-wins per key, not per operation, so concurrent `set(n => n + 1)` in two tabs loses an increment.

Size budgets were raised to absorb the server doubles and the diagnostic strings, which production bundles still retain.
