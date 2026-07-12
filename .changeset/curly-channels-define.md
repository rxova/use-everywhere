---
'use-everywhere': minor
---

Add `defineChannel(name)`: bind a channel name and message map once at module level and get fully typed `useSend`/`useMessage` hooks back, plus `get()` for reaching the same channel from non-React code. Sugar over the existing hooks — the same page-wide channel singleton is shared.
