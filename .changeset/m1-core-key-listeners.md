---
'@use-everywhere/core': patch
---

Drop a key's listener bucket when its last subscriber unsubscribes. Per-item keys (`useSharedState(\`row-${id}\`, …)`) previously left one empty `Set` behind for every key that ever mounted, for the life of the page.
