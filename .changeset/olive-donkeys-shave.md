---
'eslint-plugin-use-everywhere': patch
'@use-everywhere/test-utils': patch
'@use-everywhere/core': patch
'use-everywhere': patch
---

Broaden the npm keywords on every published package

Registry metadata is the one description of these packages that is read far more
often than it is written, and it was missing the words people actually search
for. `web-locks` and `shared-worker` are APIs the library genuinely builds on;
`cross-tab-state` and `tab-synchronization` are what the problem is called when
somebody has it and does not yet know this exists. No code changes — a patch
release is only how the new metadata reaches the registry.
