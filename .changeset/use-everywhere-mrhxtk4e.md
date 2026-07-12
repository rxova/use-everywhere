---
'use-everywhere': minor
---

Add useLeader, useIsLeader, and useLeaderEffect. useLeaderEffect runs an effect only in the elected tab and tears it down when the seat moves — the fix for N tabs opening N WebSockets. Eligibility is a property of the tab (set it in one place), so opting out is dynamic rather than a second election.
