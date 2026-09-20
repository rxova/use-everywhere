---
'use-everywhere': patch
---

Build with tsdown instead of tsup. The published output is unchanged: same dual ESM + CJS shape, same `.js`/`.cjs` filenames, same declarations, and the `'use client'` boundary is still on every entry and shared chunk.
