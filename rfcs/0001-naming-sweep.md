---
title: 'Naming sweep before 1.0'
status: open
opened: 2026-08-05
target: '1.0'
---

## Summary

Four names are wrong in ways that are cheap to fix now and expensive to fix
after 1.0, when the [stability
policy](https://rxova.org/packages/use-everywhere/under-the-hood/stability/)
makes each one a major version. This RFC proposes the renames, the deprecation
path, and — for two of the four — the argument for leaving them alone.

Nothing here changes behaviour. Every rename ships as an addition first, with
the old name kept and warning through the rest of `0.x`.

## Motivation

The names came from four different moments and were never read as a set. Read as
a set:

**1. `useOpenedWindow` sits next to `openWindow` and reads like its hook.** It is
not. `openWindow` opens a window; `useOpenedWindow` subscribes to the result of
one that is already open. Someone scanning the exports pairs them, guesses that
the hook opens a window on mount, and is wrong in a way the types do not catch —
they will write it inside a click handler's component and wonder why nothing
opened.

**2. `useMessage` reads as "give me the message".** It does not return one; it
subscribes to a type and calls a handler. The value it returns is nothing. Every
other `use*` in the library returns the thing it is named after —
`useSharedState` returns state, `usePeers` returns peers, `useLeader` returns
leadership. This one names a noun and hands back `void`.

**3. `defineStore` collides with Pinia.** Pinia's `defineStore` returns a
composable that _creates and owns_ a store, with state, getters, and actions
inside it. This `defineStore` registers options for a name and returns hooks
bound to it — no state lives in the call. Vue developers are the second-largest
audience for a cross-tab library, and they will arrive with the wrong model. The
Vue adapter, if it is ever built, makes the collision literal: two
`defineStore`s in one file.

**4. Three names for one concept.** `getSharedStore` (public), `getStore`
(internal), `StoreHooks.get` (public, on the facade) all mean "the store for this
name". Any two of them in one file is a puzzle.

## Proposal

| Today             | Proposed           | Why                                                         |
| ----------------- | ------------------ | ----------------------------------------------------------- |
| `useMessage`      | `useOnMessage`     | Names the subscription, not a return value it does not have |
| `useOpenedWindow` | `useWindowResult`  | Names what it gives you: the result of an opened window     |
| `defineStore`     | `createStoreHooks` | Says what it returns, and stops colliding with Pinia        |
| `StoreHooks.get`  | `StoreHooks.store` | A property-shaped name for a getter-shaped thing            |

`getSharedStore` stays. It is the public spelling, `getStore` is internal and
invisible, and renaming the public one to resolve an internal collision is
paying a user's cost for a maintainer's problem.

`useChannel` / `useSend` — flagged in the API review as `use*`-named non-hooks —
**stay as they are**. They were changed to be real hooks (they hold a
subscription and a stable callback), so the name is now accurate. Nothing to fix.

### Deprecation path

Every old name keeps working through `0.x`:

```ts
/** @deprecated Renamed to `useOnMessage`. Removed in 1.0. */
export const useMessage = useOnMessage;
```

Plus a dev-only warning with an error code (`UE2005`), pointing at the docs
anchor, fired once per name per session — not per call, because a rename warning
that fires inside a hook is a rename warning that fires sixty times a second.

The old names are removed **in 1.0 itself**, not in a later major. Shipping 1.0
with a deprecated surface would mean the first stable release is already
carrying a graveyard, and the stability promise starts the day it ships.

### Codemod

All four are mechanical: an identifier rename with no signature change. A
`jscodeshift` transform ships in `packages/tooling` and is documented in the
migration guide. `StoreHooks.get` → `.store` is a member-expression rename on a
value whose type is known, so it is safe to automate too.

## What breaks

Nothing, until 1.0. Then: any import of `useMessage`, `useOpenedWindow`, or
`defineStore`, and any call to `StoreHooks.get()`.

How someone finds out, in this order:

1. The deprecation warning, from the first `0.x` release after this lands.
2. A type error at 1.0 — the export is gone, so it is a compile failure, not a
   runtime one.
3. The migration guide, which lists the four with their replacements.

## Migration

Mechanical, codemod available:

```sh
npx use-everywhere-codemod rename-1.0 src/
```

Or by hand — four find-and-replaces, in any order, with no behavioural change to
reason about.

## Alternatives

**Do nothing.** Costs: `defineStore` collides with Pinia forever, and the Vue
adapter ships into that collision; `useMessage` keeps misleading everyone who
reads the export list before the docs. This is the cheapest option today and the
only one that cannot be revisited later, because after 1.0 each fix is a major.

**Rename at 2.0 instead.** Worse than both: the confusion stays, and the fix
costs a major anyway. "We will fix the names in the next major" is how names
never get fixed.

**Rename more.** `useSharedState` has been called long. It is also correct,
familiar from `useState`, and used in every example on the internet that
mentions this library. Renaming a name that is merely long, at the same time as
renaming three that are wrong, would make the migration look twice as expensive
as it is.

## Unresolved questions

- `createStoreHooks` is accurate and dull. `defineStoreHooks` keeps the shape of
  the old name for people migrating. Preference not settled.
- Whether the codemod ships as its own package or as a script in
  `packages/tooling` — a decision about how discoverable it needs to be, which
  the migration guide's audience size answers better than this RFC can.
