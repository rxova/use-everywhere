---
title: 'defineStore'
sidebar:
  order: 11
---

Shared state is per-origin, but it is not permanent: close every tab and it is
gone, because the value only ever lived in memory. `defineStore` gives a store a
disk, so it comes back.

```tsx
import { defineStore, localStorageAdapter } from 'use-everywhere';

const settings = defineStore<{ theme: string }>('settings', {
  persist: localStorageAdapter('app:settings'),
});

function ThemeToggle() {
  const [theme, setTheme] = settings.useSharedState('theme', 'light');
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>;
}
```

Call it at **module level**, like `defineChannel`. It doesn't construct
anything — it registers how the store should be built when something first
needs it, so importing the module has no side effect.

Reopen the app and the theme is there on the first paint. No flash of `'light'`.

## Why the initial doesn't win

You passed `'light'` as the initial and the stored value is `'dark'`, so why
doesn't the initial clobber it?

Because the store is hydrated **before** any hook can register a key, and
`registerKey` is a no-op for a key that already exists. The restored value is
simply already there by the time your component asks.

## It's the same store

`defineStore` doesn't create a private store. It resolves to the same singleton
that a bare hook reaches, so these two touch **one** store, and both get
persistence:

```tsx
const settings = defineStore('settings', { persist: localStorageAdapter('app:settings') });

// elsewhere, no import of `settings` at all:
const [theme] = useSharedState('theme', 'light', { store: 'settings' });
```

If `defineStore` runs _after_ that store already exists, it **warns in
development** and the live store keeps the configuration it was built with.
Handing you back a store that silently isn't persisted is exactly the bug this
design exists to prevent — so move the call to module scope, where it belongs.

Re-registering the _same_ configuration is a no-op, not a conflict. That is what
Fast Refresh does every time you edit the defining module, and comparing the
adapter by identity would flag each hot reload as a redefinition — so
configurations are compared by shape instead.

## Adapters

```tsx
localStorageAdapter('key'); // survives closing every tab
sessionStorageAdapter('key'); // survives reloads, dies with the tab
```

Both degrade to a **silent no-op** if storage is unavailable — a sandboxed
iframe, third-party cookies disabled, a full quota, or a corrupt entry from an
older version of your app. Persistence is best-effort and must never be the
thing that breaks your page.

Bring your own by implementing `PersistAdapter`:

```ts
interface PersistAdapter {
  read(): Persisted | undefined | Promise<Persisted | undefined>;
  write(snapshot: Persisted): void | Promise<void>;
  remove?(): void | Promise<void>;
}
```

Prefer a **synchronous** `read`. An async adapter can't hydrate before your
components render, so a write made in that gap can be overwritten by the
restore.

## Options

```tsx
defineStore('settings', {
  persist: localStorageAdapter('app:settings'),
  persistKeys: ['theme'], // persist only these keys
  persistDebounceMs: 100, // coalesce writes
  scope: 'everywhere', // as in useSharedState
});
```

## What actually goes to disk

The values **and their version clocks**. That's the part that matters.

A stored value carries the version it had, so a reopened tab re-enters the
last-writer-wins race with its real term instead of a fresh zero. Concretely: if
a live tab has moved the value on since you last closed, the live tab wins and
your restored value is discarded. If the live tab is _staler_ than what's on
disk, the restored value wins and the live tab updates to match. Either way,
every tab converges — you never end up with two tabs disagreeing.

Keys that were only ever _registered_ — someone's `initial`, never written — are
not persisted. There is nothing to save.
