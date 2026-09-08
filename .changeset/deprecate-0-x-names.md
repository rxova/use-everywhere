---
'use-everywhere': minor
---

The five names RFC 0001 renames for 1.0 now exist under both spellings. `useOnMessage`, `useWindowResult`, `createStoreHooks`, `useSharedSelector` and `StoreHooks.store()` are the names this release documents; `useMessage`, `useOpenedWindow`, `defineStore`, `useSharedStore` and `StoreHooks.get()` keep working and warn once per name in development (`UE2005`), as do `ChannelHooks.useMessage` and the `createNamespace` equivalents. The renamed option types — `UseOnMessageOptions`, `CreateStoreHooksOptions`, `UseWindowResult` — ship alongside their old spellings the same way. No behaviour changes and the wire protocol stays at 1. The old names are removed in 1.0: `npx use-everywhere-codemod rename-1.0 src/`.
