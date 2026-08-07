---
'@use-everywhere/core': patch
---

Let a Web Locks tab rejoin the queue after it withdraws from it

`joinQueue()` published the lock's release handle when the _request_ was made
rather than when the browser _granted_ it, so a tab merely queued behind the
holder looked like a holder itself. Withdrawing (`setEligible(false)`) aborted
the queued request but had no lock to let go of, leaving that handle behind —
and the guard in `joinQueue()` then refused to put the tab back in line when it
opted in again. A follower that toggled eligibility off and on was out of the
running for good, and the seat could be left empty when the holder went away.

The handle is now assigned inside the grant callback, where the lock is
genuinely held.
