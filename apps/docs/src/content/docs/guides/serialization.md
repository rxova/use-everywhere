---
title: 'Serialization: Dates, Maps, and the text paths'
description: 'BroadcastChannel carries structured clone, so a Date arrives a Date and a Map arrives a Map. What does not survive, and where the text paths change that.'
sidebar:
  order: 11
---

`BroadcastChannel` carries **structured clone**. A `Date` arrives a `Date`, a
`Map` arrives a `Map`.

Two paths in this library carry **text** instead — the storage-event transport
(browsers without `BroadcastChannel`) and disk persistence — and JSON is a
strictly poorer format:

| You store                 | JSON gives back      |
| ------------------------- | -------------------- |
| `new Date()`              | a string             |
| `new Map()` / `new Set()` | `{}`                 |
| `undefined` property      | the key is gone      |
| `/regex/`                 | `{}`                 |
| `Uint8Array`              | an object of indices |

So the same call had two different answers depending on which transport the
browser happened to offer. That is the kind of difference discovered in
production, on the one browser you didn't test.

## The default is loud

The default serializer **refuses** every value JSON would silently change:

```ts
store.set('createdAt', new Date());
// TypeError: use-everywhere: "createdAt" is a Date (JSON makes it a string),
// which JSON cannot round-trip. Pass a serializer (devalue, superjson) or keep
// the value JSON-shaped.
```

Same call `store.set()` already makes for values structured clone rejects: one
actionable error naming the key beats two replicas that quietly disagree.

On the persistence path it reports through `onError` rather than throwing —
persistence is best-effort and must never break your page — but it is no longer
silent.

`BigInt` and circular references need no special handling: `JSON.stringify`
already throws on both.

## Carrying more than JSON

Pass a `Serializer`. Two methods, no dependency:

```ts
import * as devalue from 'devalue';

const settings = createStoreHooks('settings', {
  persist: localStorageAdapter('app:settings', {
    serializer: { stringify: devalue.stringify, parse: devalue.parse },
  }),
});
```

`superjson` works the same way. So does anything of your own — the interface is
`{ stringify(value): string; parse(text): unknown }`.

The `StorageTransport` takes one too, as its third argument, so the wire and the
disk can be given matching fidelity.

## Why it isn't bundled

Measured, brotlied, bundled as a production app would:

|                           | Size   |
| ------------------------- | ------ |
| `@ungap/structured-clone` | 1.0 kB |
| `devalue`                 | 3.4 kB |
| `superjson`               | 3.6 kB |
| `seroval`                 | 7.4 kB |

The whole of `@use-everywhere/core` is **7.3 kB**. Bundling devalue would add
47% to every user's bundle for a fidelity most applications don't need, because
most state is already JSON-shaped.

So the seam is the answer, not the dependency — the same call as
[payload schemas](./validating-payloads.md), where the library accepts any
Standard Schema without depending on Zod.

## Related

- [Validating payloads](./validating-payloads.md) — checking shape, rather than
  preserving type
- [Persistence](./persistence.md) — versions and migrations on the same path
- [Transports](../core/transports.md) — when the storage fallback is used at all
