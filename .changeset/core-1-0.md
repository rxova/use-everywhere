---
'@use-everywhere/core': major
---

1.0. No export changes name and the wire protocol stays at version 1 — a 1.0 tab interoperates with any 0.x tab. What changes is the contract: the stability policy is in effect from this release, so every named export of every entry point is public API, and any future rename or changed default is a major with a deprecation period first.
