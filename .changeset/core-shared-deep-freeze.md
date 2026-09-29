---
"@use-everywhere/core": patch
---

The development-only deep freeze on values entering a store now uses `deepFreeze` from `@rxova/ts-utils`, inlined at build time. Behaviour is unchanged and core still has no runtime dependencies.
