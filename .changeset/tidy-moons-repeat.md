---
'use-everywhere': patch
---

Broaden the npm keywords

Registry metadata is read far more often than it is written, and it was missing
the words people search for. `web-locks` and `shared-worker` are APIs this
library genuinely builds on; `cross-tab-state` and `tab-synchronization` are what
the problem is called by somebody who has it and does not yet know this exists.
No code changes — a patch release is only how the new metadata reaches npm.
