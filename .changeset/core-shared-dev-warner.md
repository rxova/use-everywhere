---
"@use-everywhere/core": patch
---

Development warnings now go through `createDevWarner` from `@rxova/ts-utils`, inlined at build time, so core still has no runtime dependencies. The message text and the error-page links are unchanged. Two small differences: a boolean `__DEV__` global now overrides `NODE_ENV` when deciding whether to warn, and the check runs on every warning rather than once at import. Production bundles still drop every warning string. The shared helper adds about 200–290 B to each entry point, and the size budgets have been raised to match.
