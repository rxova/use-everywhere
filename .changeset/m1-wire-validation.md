---
'@use-everywhere/core': patch
---

Validate wires before trusting their shape. A peer posting a `patch` or leader `claim` whose `version`/`term` was not a version clock — a different deploy of your app mid-rollout, or any buggy script on the origin — reached `newer()` and threw a `TypeError` inside the receiving tab's message handler, where nothing catches it.

The envelope check now also requires `scope`, `type`, and `clientId` to be strings, and malformed version clocks are dropped rather than applied. Found by the new property-based suite, which fuzzes arbitrary wires at a live store.
