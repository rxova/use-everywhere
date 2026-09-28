---
'use-everywhere': patch
---

Development warnings (UE2xxx) now go through `createDevWarner` from `@rxova/ts-utils`, inlined at build time, so the only runtime dependency is still `@use-everywhere/core`. The message text and the error-page links are unchanged. Two small differences: a boolean `__DEV__` global now overrides `NODE_ENV` when deciding whether to warn, and the check runs on every warning rather than once at import. Production bundles still drop every warning string. The shared helper adds about 200–270 B to each entry point, and the size budgets have been raised to match.
