---
'use-everywhere': major
---

1.0. Renamed per RFC 0001; the old names, deprecated in 0.13 (`UE2005`), are removed: `useMessage` → `useOnMessage`, `useOpenedWindow` → `useWindowResult`, `defineStore` → `createStoreHooks`, `useSharedStore` → `useSharedSelector`, `StoreHooks.get()` → `StoreHooks.store()`, `UseMessageOptions` → `UseOnMessageOptions`, `DefineStoreOptions` → `CreateStoreHooksOptions`, `UseOpenedWindow` → `UseWindowResult`; `ChannelHooks.useMessage` → `useOnMessage`; `ReactNamespace.defineStore` / `.useSharedStore` follow. No behaviour change; wire protocol stays at 1. Migrate with `npx use-everywhere-codemod rename-1.0 src/`.
