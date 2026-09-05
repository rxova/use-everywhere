---
title: 'Naming sweep before 1.0'
status: implemented
opened: 2026-08-05
amended: 2026-08-31
decided: 2026-09-04
shipped: '1.0.0'
target: '1.0'
---

:::note[Decision]
Accepted as amended; shipped in 1.0.0. The old names are removed in 1.0 with no
`0.x` deprecation release, so `UE2005` was never emitted and stays unassigned.
`ChannelHooks.useMessage` and the `ReactNamespace` members `defineStore` and
`useSharedStore` are renamed with the exports they wrap; the codemod covers them.
:::

## Summary

Five names are wrong in ways that are cheap to fix now and expensive to fix
after 1.0, when the [stability
policy](https://rxova.org/packages/use-everywhere/under-the-hood/stability/)
makes each one a major version. This RFC proposes the renames, the deprecation
path, and — for the names it leaves alone — the argument for doing so.

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

**5. `useSharedStore` does not return a store.** It is the selector hook: it
takes a selector and a comparator and subscribes to a slice. `getSharedStore`,
three lines above it in the same export list, _does_ return the store. Two names
one character apart for a value and a subscription is the item 4 problem again,
and the tree already knows the right answer — the module is
`use-shared-selector.ts` and the options type is `UseSharedSelectorOptions`. The
internal name has been correct all along; only the export is wrong.

## Proposal

| Today             | Proposed            | Why                                                                 |
| ----------------- | ------------------- | ------------------------------------------------------------------- |
| `useMessage`      | `useOnMessage`      | Names the subscription, not a return value it does not have         |
| `useOpenedWindow` | `useWindowResult`   | Names what it gives you: the result of an opened window             |
| `defineStore`     | `createStoreHooks`  | Says what it returns, and stops colliding with Pinia                |
| `StoreHooks.get`  | `StoreHooks.store`  | A property-shaped name for a getter-shaped thing                    |
| `useSharedStore`  | `useSharedSelector` | Subscribes to a slice; it is not the store, and `getSharedStore` is |

Three exported types are renamed with the functions they describe. They are
named exports of `index.ts`, which the stability policy makes public API, so
leaving them behind would mean renaming them later at the cost of a major:

| Today                | 1.0                       |
| -------------------- | ------------------------- |
| `UseMessageOptions`  | `UseOnMessageOptions`     |
| `DefineStoreOptions` | `CreateStoreHooksOptions` |
| `UseOpenedWindow`    | `UseWindowResult`         |

`OpenedWindowStatus`, `OpenedWindowState` and `OpenedWindowControls` stay. They
describe the window rather than the hook, and `openWindow` keeps its name.

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

All five are mechanical: an identifier rename with no signature change. A
`jscodeshift` transform ships as its own published package,
`use-everywhere-codemod`, and is documented in the migration guide.
`StoreHooks.get` → `.store` is a member-expression rename on a value whose type
is known, so it is safe to automate too.

## What breaks

Nothing, until 1.0. Then: any import of `useMessage`, `useOpenedWindow`,
`defineStore` or `useSharedStore`, any call to `StoreHooks.get()`, and any
reference to the three renamed option types.

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

## Resolved questions

Both questions this RFC opened with are now settled.

**`createStoreHooks`, not `defineStoreHooks`.** It matches `createChannel`,
`createLeader`, `createPresence` and `createNamespace` — the verb this codebase
already uses for "build me the thing and hand it back". `defineStoreHooks` would
keep the shape of the name being moved away from, which is the wrong half to
preserve when the objection is that the shape is what collides with Pinia.

**The codemod ships as its own published package**, `use-everywhere-codemod`,
unscoped. The migration guide and this RFC both already print
`npx use-everywhere-codemod rename-1.0 src/`, and `npx` resolves a package name
from the registry — a script inside `packages/tooling` is not published, so that
command would have to become a git URL. The documented invocation is the
requirement; the package layout follows from it.

Because the codemod is a migration tool with a finite life rather than a surface
the stability policy promises anything about, it stays on a `0.x` line of its own
when the libraries go to 1.0.
