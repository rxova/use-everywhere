---
'@use-everywhere/core': minor
---

Version and migrate persisted state, and make hydration observable.

Disk is where version skew has its longest fuse. A wire from another deploy is gone in a second; a value written by last month's build sits in storage until someone reopens that tab, and then restores carrying its original version clock — which beats every live tab, in whatever shape the app had a month ago. There was no way to notice, let alone act.

**`persist.version` + `persist.migrate`.** `version` is the shape of _your_ state, not the `v: 1` envelope the library owns. Default 0, which is also what anything written before this existed reads as, so adopting it works on data already out there.

- Same version → restored as-is.
- Older, with `migrate` → migrated, then restored. Migrated values **keep their clocks**, so a restored value re-enters the last-writer-wins order where the original left it. A key the migration _adds_ has no clock on disk, so it gets a fresh one — counter 1, attributed to the tab that ran the migration: a real write that beats an untouched initial and still loses to a live tab holding something newer.
- Older, no `migrate` → refused.
- **Newer than this build → refused, always.** A build cannot be asked to understand a shape that postdates it, and guessing would put values it misreads back on the wire with winning clocks. Same call the envelope makes for an unknown wire protocol. This happens for real on every rollback and every old tab reopened after a deploy.

A refused restore leaves the store on its initial values and reports through **`persist.onRestoreError`** (`'ahead' | 'no-migrate' | 'migrate-threw'`), defaulting to a development warning. A migration that throws is caught and reported with the original error as `cause` — a bug in a migration must not take the store down on every page load.

**`store.hydrated`** resolves once the restore has landed, been refused, or been found absent; already resolved when there is no persistence. It closes a gap that only async adapters have and that last-writer-wins makes invisible: the store returns on its initial values, a keystroke writes at counter 1, the restore arrives holding counter 5, and the newer keystroke is correctly discarded. Every step is right and the result is a lost keystroke with nothing to point at. It never rejects — a store that kept its initial values is usable, and a promise nobody can await is not.

Three size budgets move up by ~160-200 B on the entries carrying the store.

New **Persistence: versions, migrations, hydration** guide.
