---
'@use-everywhere/core': minor
---

Probe peers before pruning them, so a throttled tab is not mistaken for a dead one

Browsers clamp a hidden tab's timers to roughly one tick a minute, so a healthy
backgrounded peer stops heartbeating on schedule. Pruning on silence alone made
the roster oscillate once a minute for a tab that never went anywhere.

Message handlers are not throttled, only timers are — so a peer that goes quiet
is now sent a `hello` and only removed if it stays silent through a further
`probeGraceMs` (new option, default 1000ms). A peer that answers in time is never
removed, so subscribers see no membership change rather than a drop and re-add.
Buses also re-announce on `visibilitychange`, which re-registers a returning tab
within a round trip instead of a heartbeat — the case that matters after a
laptop wakes and every tab is throttled at once.
