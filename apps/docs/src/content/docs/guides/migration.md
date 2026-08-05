---
title: 'Migrating to 1.0'
sidebar:
  order: 12
---

What changes between the `0.x` line and 1.0, written while the changes are still
proposals rather than after they shipped — so that anyone on `0.x` today can see
the bill before it arrives.

:::caution[Not final]
1.0 has not shipped. This page tracks accepted and proposed changes; anything
marked **proposed** can still be argued with, in the
[RFC](https://github.com/rxova/use-everywhere/tree/main/rfcs) that owns it.
:::

## The short version

If you are on `0.8` and you use the hooks by their documented names, the
migration is **four renames, all mechanical, all with a codemod**. Nothing about
how the library behaves changes.

## Renames — proposed

From [RFC 0001](https://github.com/rxova/use-everywhere/blob/main/rfcs/0001-naming-sweep.md).

| `0.x`             | `1.0`              | Reason                                          |
| ----------------- | ------------------ | ----------------------------------------------- |
| `useMessage`      | `useOnMessage`     | It subscribes; it does not return a message     |
| `useOpenedWindow` | `useWindowResult`  | It reads the result; `openWindow` opens         |
| `defineStore`     | `createStoreHooks` | Collides with Pinia, which means something else |
| `StoreHooks.get`  | `StoreHooks.store` | One concept, one name                           |

Every old name keeps working for the rest of `0.x`, with a deprecation warning
(`UE2005`) that fires once per name per session. They are removed **in 1.0**, so
the failure is a compile error rather than a surprise at runtime.

```sh
npx use-everywhere-codemod rename-1.0 src/
```

Names that are **not** changing, in case you were bracing for them:
`useSharedState`, `useSharedReducer`, `useSharedStore`, `usePeers`,
`useClientId`, `useLeader`, `useLeaderEffect`, `useChannel`, `useSend`, `useAsk`,
`useAnswer`, `useHydrated`, `getSharedStore`, `createNamespace`, `defineChannel`.

## Behaviour that does not change

Stated because the honest question about a 1.0 is "what will bite me quietly":

- **The wire protocol stays at version 1.** A 1.0 tab and a `0.8` tab
  interoperate. This is the promise the
  [stability policy](../under-the-hood/stability.md) makes and the reason the
  protocol is versioned separately from the package.
- **Last-writer-wins stays the default** for `useSharedState`. If you want
  add-up semantics you still reach for `useSharedReducer`, exactly as today.
- **Persistence stays best-effort**, and `useHydrated` stays the way to gate UI
  on a restore.
- **Nothing becomes stricter.** Values that `set()` accepts today keep being
  accepted; making a value stricter is a major change under the policy, and 1.0
  is not spending its major on one.

## What "1.0" actually buys you

Not features. The contract: the
[stability policy](../under-the-hood/stability.md) takes effect, `experimental_`
becomes the only surface allowed to change under you, and every remaining
breaking change goes through an [RFC](https://github.com/rxova/use-everywhere/tree/main/rfcs)
with a two-week comment period rather than a maintainer's judgement call.

## If you are starting today

Use the current names. The codemod exists precisely so that starting on `0.8`
does not mean starting behind.
