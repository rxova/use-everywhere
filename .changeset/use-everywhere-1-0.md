---
'use-everywhere': major
---

1.0. The stability policy is in effect from this release: every named export of every entry point is public API, a rename or a changed default is a major, and removals go through a deprecation period first.

Five exports and three types are renamed per RFC 0001, and the old names are removed: `useMessage` → `useOnMessage`, `useOpenedWindow` → `useWindowResult`, `defineStore` → `createStoreHooks`, `useSharedStore` → `useSharedSelector`, `StoreHooks.get()` → `StoreHooks.store()`, `UseMessageOptions` → `UseOnMessageOptions`, `DefineStoreOptions` → `CreateStoreHooksOptions`, `UseOpenedWindow` → `UseWindowResult`. The bound hook from `defineChannel` and the `ReactNamespace` members follow (`shop.useOnMessage`, `ns.createStoreHooks`, `ns.useSharedSelector`). Nothing about behaviour changes and the wire protocol stays at version 1. Run `npx use-everywhere-codemod rename-1.0 src/`, or see the migration guide.
