---
'use-everywhere': minor
---

Enumerate the re-exported core surface instead of `export * from '@use-everywhere/core'`, and move the test seams to a `testing` subpath.

```diff
-import { MemoryHub } from 'use-everywhere';
+import { MemoryHub } from 'use-everywhere/testing';
```

The wildcard made this package's public API implicitly whatever core happened to export, so anything added to core became a 1.0 compatibility promise here without a decision being made. The re-export list is now explicit; every name on it is deliberate. The full runtime surface is unchanged apart from the test seams moving.
