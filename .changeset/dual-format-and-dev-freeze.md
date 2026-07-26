---
'@use-everywhere/core': minor
---

Ship a CommonJS build alongside ESM so `require('@use-everywhere/core')` resolves in Jest and other CJS toolchains, not just `import`. The `exports` map now serves per-condition types (`.d.ts`/`.d.cts`) and is clean under are-the-types-wrong across node10, node16 (CJS + ESM), and bundler.

Also deep-freeze shared values in development: a store's `state` proxy is shallow, so an accidental in-place mutation (`store.state.list.push(x)`, or mutating a value you read) bumps no version clock and silently fails to sync. In dev that now throws a `TypeError` at the offending line; production strips the freeze entirely, so it costs nothing shipped.
