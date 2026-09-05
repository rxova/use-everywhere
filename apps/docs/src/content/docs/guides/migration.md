---
title: 'Migrating to 1.0'
description: 'What changed between the 0.x line and 1.0 of use-everywhere, and how to move across without a rewrite.'
sidebar:
  order: 12
---

What changed between the `0.x` line and 1.0, and how to move across.

## The short version

If you are on `0.x` and you use the hooks by their documented names, the
migration is **five renames, all mechanical, all covered by a codemod**.
Nothing about how the library behaves changes.

```sh
npx use-everywhere-codemod rename-1.0 src/
```

Run it once, review the diff, commit.

## Renames

From [RFC 0001](https://github.com/rxova/use-everywhere/blob/main/rfcs/0001-naming-sweep.md).

| `0.x`              | `1.0`                | Reason                                                  |
| ------------------ | -------------------- | ------------------------------------------------------- |
| `useMessage`       | `useOnMessage`       | It subscribes; it does not return a message             |
| `useOpenedWindow`  | `useWindowResult`    | It reads the result; `openWindow` opens                 |
| `defineStore`      | `createStoreHooks`   | Collides with Pinia, which means something else         |
| `StoreHooks.get()` | `StoreHooks.store()` | One concept, one name                                   |
| `useSharedStore`   | `useSharedSelector`  | It subscribes to a slice; `getSharedStore` is the store |

Three option types are renamed with the functions they describe:
`UseMessageOptions` → `UseOnMessageOptions`, `DefineStoreOptions` →
`CreateStoreHooksOptions`, `UseOpenedWindow` → `UseWindowResult`.

The hook `defineChannel` hands back follows the standalone one:
`shop.useMessage(...)` is now `shop.useOnMessage(...)`. Same for a namespace:
`checkout.defineStore(...)` is `checkout.createStoreHooks(...)`, and
`checkout.useSharedStore(...)` is `checkout.useSharedSelector(...)`.

The codemod covers all of it.

Names that are **not** changing, in case you were bracing for them:
`useSharedState`, `useSharedReducer`, `usePeers`, `useClientId`, `useLeader`,
`useLeaderEffect`, `useChannel`, `useSend`, `useAsk`, `useAnswer`, `useHydrated`,
`getSharedStore`, `createNamespace`, `defineChannel`, `ChannelHooks.get()`,
`openWindow`, and everything in `@use-everywhere/core`.

## How you find out

The old names are removed in 1.0, not deprecated. An import of one is a compile
error; run the codemod, or rename by hand.

## What the codemod covers

Imports from `use-everywhere` and every reference to them, `import * as`,
`require('use-everywhere')`, and barrel re-exports. `StoreHooks.get()` and
`ChannelHooks.useMessage()` are renamed where the receiver was built from
`defineStore` / `defineChannel` in the same file; a `.useMessage(...)` call on
a receiver it cannot attribute is printed with its file and line instead. See
the [package README](https://www.npmjs.com/package/use-everywhere-codemod).

## Behaviour that does not change

Stated because the honest question about a 1.0 is "what will bite me quietly":

- **The wire protocol stays at version 1.** A 1.0 tab and any `0.x` tab
  interoperate. This is the promise the
  [stability policy](../under-the-hood/stability.md) makes and the reason the
  protocol is versioned separately from the package.
- **Last-writer-wins stays the default** for `useSharedState`. If you want
  add-up semantics you still reach for `useSharedReducer`, exactly as today.
- **Persistence stays best-effort**, and `useHydrated` stays the way to gate UI
  on a restore.
- **Nothing becomes stricter.** Values that `set()` accepts today keep being
  accepted; making a value stricter is a major change under the policy, and 1.0
  did not spend its major on one.
- **`@use-everywhere/core`, `eslint-plugin-use-everywhere` and
  `@use-everywhere/test-utils`** are 1.0 alongside the React package. None of
  their exports changed name; the ESLint rules match `createStoreHooks` where
  they matched `defineStore`.

## What "1.0" actually buys you

Not features. The contract: the
[stability policy](../under-the-hood/stability.md) is in effect, `experimental_`
is the only surface allowed to change under you, and every remaining breaking
change goes through an [RFC](https://github.com/rxova/use-everywhere/tree/main/rfcs)
with a two-week comment period rather than a maintainer's judgement call.

## If you are starting today

Use the 1.0 names.
