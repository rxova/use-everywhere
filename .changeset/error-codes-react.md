---
'use-everywhere': minor
---

Re-export the coded diagnostics from core, so a warning printed through the React
package carries the same `UE####` code and the same link to the page that
explains it.

The code is the durable part: a message can be reworded, mangled by a minifier
or truncated by a log aggregator, and `UE1001` survives all three. Code that
matched on the text — a test asserting a console warning, a log filter — should
match on the code instead.
