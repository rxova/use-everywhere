# use-everywhere

## 0.3.0

### Minor Changes

- 1ce8824: Add useLeader, useIsLeader, and useLeaderEffect. useLeaderEffect runs an effect only in the elected tab and tears it down when the seat moves — the fix for N tabs opening N WebSockets. Eligibility is a property of the tab (set it in one place), so opting out is dynamic rather than a second election.
- 0bf735a: Add defineStore(name, { persist }): bind a store name and its persistence once at module level and get typed useSharedState back, plus get() for non-React code. It resolves to the same store singleton a bare useSharedState({ store: name }) reaches, so both get persistence. Running it after that store already exists throws rather than quietly handing back an unpersisted store.
- 6d4daa3: Add <Inspector /> on the new use-everywhere/devtools subpath: a floating panel showing this tab's peers, the leader, every store key with its version clock, and a live log of wires in both directions. It lives on a separate entry point, so it stays out of your bundle unless you import it, and it never creates a Leader — a devtool that enrolled your tab in an election it never asked to join would change the thing it measures. It reads the crown out of the wire log instead.

### Patch Changes

- ad7f986: Re-export the new core debug helpers (observeBus, enableDebug, getBusNames). DEFAULT_NAME now comes from core; its value and behavior are unchanged.
- 23b8bd3: Internal: the store registry's map key contained a literal NUL byte. It worked, but git classifies any file holding one as binary, so every change to registry.ts rendered as an unreviewable 'Bin ... bytes' diff. No behavior change.
- 5d6f8de: No API change. Adds a Playwright end-to-end suite covering what unit tests cannot: a real BroadcastChannel across real tabs, real pagehide handover, and real localStorage surviving the last tab.
- Updated dependencies [ad7f986]
- Updated dependencies [1ce8824]
- Updated dependencies [0bf735a]
  - @use-everywhere/core@0.3.0
