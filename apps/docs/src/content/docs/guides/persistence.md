---
title: 'Persistence: versions, migrations, hydration'
description: 'Persist shared state across reloads, and handle the version skew that comes with it: schema versions, migrations and hydration.'
sidebar:
  order: 9
---

Disk is where version skew has its longest fuse.

A wire from another deploy is gone in a second. A value written by last month's
build sits in `localStorage` until someone reopens that tab — and then restores
carrying its original version clock, which beats every live tab. The shape it
was written in is whatever your app looked like a month ago.

This page is the two tools for that, plus the one thing async persistence makes
invisible.

## Versioning your state's shape

```ts
const settings = createStoreHooks('settings', {
  persist: localStorageAdapter('app:settings'),
  persistVersion: 2,
  migrate: (state, from) => {
    if (from < 2) return { ...state, fullName: `${state.first} ${state.last}` };
    return state;
  },
});
```

`persistVersion` is the version of **your** state's shape. Bump it whenever a
key changes meaning or type. It is not the same as the `v: 1` inside the stored
record — that's the envelope, and the library owns it.

Default is `0`, which is also what anything written before versioning existed
reads as. So adding a version and a migration to a shipped app works on the data
already out there.

### What happens at each version relationship

| On disk                   | Result                  |
| ------------------------- | ----------------------- |
| Same as yours             | restored as-is          |
| **Older**, with `migrate` | migrated, then restored |
| **Older**, no `migrate`   | refused                 |
| **Newer** than yours      | refused                 |

A refused restore leaves the store on its initial values and reports through
`onRestoreError`. The store works normally either way — persistence is
best-effort, and that doesn't change here.

**Newer data is always refused, even if you supply a `migrate`.** A build can't
be asked to understand a shape that postdates it, and guessing would put values
it misreads back on the wire carrying winning clocks. That's the same call the
[wire protocol](../under-the-hood/version-skew.md) makes for a version it
doesn't know. It happens for real whenever a user opens an old tab after a
deploy, or you roll back.

### Clocks, and keys a migration adds

Migrated values **keep their version clocks**, so a restored value re-enters the
last-writer-wins order where the original left it rather than at zero.

A key your migration _creates_ has no clock on disk — it didn't exist when that
file was written. It gets a fresh one: counter 1, attributed to the tab that ran
the migration. That's a real write, so it beats any untouched initial, and it
still loses to a live tab holding something newer. Which is right: live data
outranks a migration of stale disk.

### Handling failure

```ts
createStoreHooks('settings', {
  persist: localStorageAdapter('app:settings'),
  persistVersion: 2,
  migrate,
  onRestoreError: ({ reason, found, expected }) => {
    telemetry.warn('persist.restore', { reason, found, expected });
  },
});
```

`reason` is `'ahead'`, `'no-migrate'`, or `'migrate-threw'`. A migration that
throws is caught — a bug in a migration must not take the store down on every
page load — and reported with the original error as `cause`.

Without `onRestoreError` you get a development warning instead.

## Knowing when the restore has landed

Only relevant for **async** adapters. A synchronous one — `localStorageAdapter`
and friends — has finished before the store is handed back.

An async adapter can't. And the gap it leaves is one last-writer-wins makes
invisible:

1. The store is created and returns immediately, on its initial values.
2. The user types. That writes at counter 1.
3. The restore lands, holding counter 5.
4. Last-writer-wins correctly discards the newer keystroke.

Every step is right and the result is a lost keystroke with nothing to point at.

```tsx
const ready = useHydrated({ store: 'settings' });
return <input disabled={!ready} value={draft} onChange={…} />;
```

Or in non-React code:

```ts
await store.hydrated;
```

`hydrated` resolves once the restore has landed, been refused, or been found
absent. It never rejects — a store that kept its initial values is usable, and a
promise nobody can await is not.

`useHydrated` is `false` on the first render even when there is nothing to wait
for. That's deliberate: a value that differed between the server render and the
browser's hydrating render would be a hydration mismatch in every app that used
it, which is the same reason `useClientId` reports `''` until the commit after
hydration.

## Choosing an adapter

|                | `localStorageAdapter`                                                  | `indexedDbAdapter`                             |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Fidelity       | JSON — needs a [serializer](./serialization.md) for `Date`/`Map`/`Set` | structured clone, so those work as-is          |
| Room           | a few MB, shared with the whole origin                                 | orders of magnitude more                       |
| Restore        | synchronous, done before the store is returned                         | asynchronous — gate on `hydrated`              |
| Flush on close | synchronous, so `pagehide` lands                                       | cannot be awaited; the last write may not land |

The rule of thumb: **`localStorage` for small state you would mind losing,
IndexedDB for everything large or not JSON-shaped.** Using both is normal —
they are separate adapters on separate stores.

```ts
createStoreHooks('settings', { persist: localStorageAdapter('app:settings') });
createStoreHooks('workspace', { persist: indexedDbAdapter('workspace') });
```

Note that `indexedDbAdapter` takes **no serializer**, on purpose. IndexedDB
already stores with the structured clone algorithm — the same one
`BroadcastChannel` uses — so handing it a JSON serializer would only reintroduce
the losses the seam exists to prevent.

## Related

- [Version skew & the wire contract](../under-the-hood/version-skew.md) — the
  same problem on a shorter fuse
- [Validating payloads](./validating-payloads.md) — schemas also guard what
  comes back from disk
- [Limitations & FAQ](../under-the-hood/limitations.md) — why persistence is
  best-effort
