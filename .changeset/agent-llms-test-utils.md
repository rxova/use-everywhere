---
'@use-everywhere/test-utils': patch
---

Ship an `llms.txt` in the package tarball. It is what a coding agent reads out of `node_modules` after an install: what the package is, how to install it, a working example, the public surface, and the mistakes that are silent at runtime. `check-llms.ts` checks its API table against the package's real entry points, so a renamed export fails the build rather than leaving the file describing an API that no longer exists.
