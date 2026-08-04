---
'use-everywhere': minor
---

`defineStore` takes the new persistence options, and `useHydrated` gates UI on the restore.

```tsx
const settings = defineStore('settings', {
  persist: localStorageAdapter('app:settings'),
  persistVersion: 2,
  migrate: (state, from) =>
    from < 2 ? { ...state, fullName: `${state.first} ${state.last}` } : state,
  onRestoreError: ({ reason }) => telemetry.warn('persist.restore', { reason }),
});
```

`useHydrated({ store })` is `false` on the first render and `true` once the restore lands — including when there is nothing to restore, which settles immediately.

It starts `false` even for a synchronous adapter that has already finished, deliberately: a value that differed between the server render and the browser's hydrating render would be a hydration mismatch in every app that used it, which is the same reason `useClientId` reports `''` until the commit after hydration. The gap it exists for is real only for **async** adapters, and it is one last-writer-wins makes invisible — the store returns on its initial values, a keystroke writes at counter 1, the restore arrives holding counter 5, and the newer keystroke is correctly discarded.

The server store double gained a resolved `hydrated`, so `await store.hydrated` proceeds during SSR rather than hanging — a server render has nothing to restore and is documented to render defaults.

`persistVersion` is part of the store's config signature, so redefining with a different version after the store exists warns rather than being silently ignored. `migrate` is not, because Fast Refresh rebuilds the function on every edit.

Four size budgets move up by ~180-270 B, tracking the core store beneath them.
