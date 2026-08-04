---
'@use-everywhere/core': minor
---

Presence carries metadata, and can include this client in its own roster.

Presence answered "who is here" and nothing about _who they are_. A display name, a tab title, a cursor — the things an avatar strip or a collaborative UI actually needs — had no way to travel.

`createPresence(name, { metadata })` publishes it; `presence.setMetadata(next)` changes it; every `Peer` carries what that client announced.

Two decisions that stop it churning:

- **Metadata rides `hello`, never `ping`.** A ping is a heartbeat and arrives constantly; attaching metadata would re-announce unchanged data forever and rebuild every subscriber's roster on a timer. A ping therefore leaves what is already known in place rather than blanking it.
- **It compares by value, not reference.** Metadata arrives freshly deserialised every time, so a reference check would call every announcement a change. `setMetadata` with an equal value announces nothing and notifies nobody, which is what makes it safe to call on every render.

**`includeSelf`** puts this client in its own roster, populated from the first read rather than appearing once somebody else turns up — an avatar list that starts empty and fills in later is a flicker, not a feature. Off by default, because the question a presence strip asks is who _else_ is here.

Adding `metadata` to the presence wire is additive within v1: a build that predates it neither sets nor reads it.
