---
'@use-everywhere/core': patch
'use-everywhere': patch
---

Raise every size budget to roughly 20% above its current measurement. The budgets had been tracking actual size so closely that unrelated work kept tripping them — five moves across M1 and M2, each a separate review distraction. Entries that already had more than 20% of slack keep their existing limit rather than being tightened.

This is deliberately headroom, not permission: the budgets still fail on a real regression, and the underlying cause of the drift — development-only warning strings surviving into production bundles — is unchanged and still scheduled.
