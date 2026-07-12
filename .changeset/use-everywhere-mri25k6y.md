---
'use-everywhere': patch
---

No API change. Adds a Playwright end-to-end suite covering what unit tests cannot: a real BroadcastChannel across real tabs, real pagehide handover, and real localStorage surviving the last tab.
