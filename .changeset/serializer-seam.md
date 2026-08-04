---
'@use-everywhere/core': minor
---

Make the two text paths agree with the wire, or say so.

`BroadcastChannel` carries structured clone; the storage-event transport and disk persistence carry text. JSON is a strictly poorer format — a `Date` comes back a string, a `Map` comes back `{}`, an `undefined` property is simply gone — so the same call had two different answers depending on which transport the browser happened to offer. Persistence had no guard at all.

**The default serializer now refuses what it would silently change**: `Date`, `Map`, `Set`, `RegExp`, typed arrays, functions, symbols, and `undefined`. The error names the key. That is the same call `store.set()` already makes for a value structured clone rejects — one actionable error beats two replicas that quietly disagree. On the persistence path it reports through `onError` instead of throwing, because persistence is best-effort and must never break the page, but it is no longer silent. `BigInt` and cycles need no code: `JSON.stringify` already throws on both.

**A `Serializer` seam** carries the rest. Two methods, `stringify` and `parse`, accepted by `webStorageAdapter`/`localStorageAdapter`/`sessionStorageAdapter` and by `StorageTransport`, so wire and disk can be given matching fidelity:

```ts
import * as devalue from 'devalue';

localStorageAdapter('settings', {
  serializer: { stringify: devalue.stringify, parse: devalue.parse },
});
```

**Deliberately not a bundled dependency.** Measured brotlied, bundled as a production app would: `@ungap/structured-clone` 1.0 kB, `devalue` 3.4 kB, `superjson` 3.6 kB, `seroval` 7.4 kB — against a whole-library budget of 7.3 kB. Bundling devalue would add 47% to every user for a fidelity most applications do not need, since most state is already JSON-shaped. The seam is the answer, not the dependency, the same call as payload schemas accepting any Standard Schema without depending on Zod.

New **Serialization** guide, including the measurements.
