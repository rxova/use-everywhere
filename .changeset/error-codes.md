---
'@use-everywhere/core': minor
'use-everywhere': minor
---

Give every diagnostic a code and a link to the page that explains it.

```
[use-everywhere] UE1001: second shared store for "cart" in this tab — …
  → https://rxova.github.io/use-everywhere/errors/#ue1001
```

The code is the durable part: a message can be reworded, mangled by a minifier
or truncated by a log aggregator, and `UE1001` survives all three. Codes are
permanent and never reused — an old build in somebody's browser is still
emitting them.

Warnings still cost nothing in production: the call sites keep their
`process.env.NODE_ENV` guard, and the test that proves it now counts codes
rather than scanning for a prefix, so a leak names the warning that leaked.

The message text is otherwise unchanged. Code that matched on it — a test
asserting a console warning, a log filter — should match on the code instead.
