---
'use-everywhere': minor
---

The Inspector's wire log becomes usable while something is going wrong: pause,
clear, and a filter that matches on `scope/type` and on the sender.

Pausing freezes the log and nothing else. The observer stays subscribed — tearing
it down and back up would drop the traffic in between, and a log you paused is
not a log with a hole in it — and the crown keeps updating, because leadership
is state rather than history and a frozen one would be a lie.

State is editable, too. Click a value, type JSON, press Enter: the write goes
**through the store**, so it takes a version and reaches every tab, which is the
only edit worth having. A draft that is not JSON is refused and marked rather
than guessed at — `light` and `"light"` mean different things, and a panel that
picks one for you starts disagreeing with the wire.
