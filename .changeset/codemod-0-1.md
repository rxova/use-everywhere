---
'use-everywhere-codemod': minor
---

First release. `npx use-everywhere-codemod rename-1.0 src/` rewrites a 0.x codebase to the 1.0 names — the five renamed exports, the three renamed types, `StoreHooks.get()` and the bound `defineChannel` / namespace members — editing identifiers in place so every other byte of every file is untouched. `--dry-run` lists what would change. A `.useMessage()` call on a receiver it cannot attribute is reported rather than rewritten.
