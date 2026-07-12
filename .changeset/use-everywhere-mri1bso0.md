---
'use-everywhere': patch
---

Internal: the store registry's map key contained a literal NUL byte. It worked, but git classifies any file holding one as binary, so every change to registry.ts rendered as an unreviewable 'Bin ... bytes' diff. No behavior change.
