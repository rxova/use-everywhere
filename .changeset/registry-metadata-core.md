---
'@use-everywhere/core': patch
---

Point `homepage` at the core overview, and broaden `keywords`.

`homepage` is the link npm renders on the package page, so it was sending everyone who arrived from the registry to a README instead of the documentation. The keywords described the mechanism (`broadcastchannel`, `cross-tab`) but not the problem, so none of them matched what someone with the bug actually searches for — added the vocabulary that side uses, plus `broadcast-channel`, which npm treats as a different term from the unhyphenated spelling already listed.
