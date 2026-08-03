---
'@use-everywhere/core': minor
---

Move `MemoryHub` and `MemoryTransport` to a `testing` subpath.

```diff
-import { MemoryHub } from '@use-everywhere/core';
+import { MemoryHub } from '@use-everywhere/core/testing';
```

They are a multi-tab simulation harness, not runtime API. On the package root they were part of the public, semver-bound surface — something 1.0 would have to promise not to break — and sat in every production bundle's module graph. Nothing else moved: `BroadcastChannelTransport`, `NoopTransport`, and `defaultTransport` are real transports and stay on the root.
