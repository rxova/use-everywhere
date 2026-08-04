---
'use-everywhere': minor
---

`defineChannel(name, options)` takes the new payload `schema` map.

Channels had no options plumbing at all, so the seam core just gained was unreachable from React. `defineChannel` now mirrors `defineStore`: options are registered at module scope and applied when the channel is first needed, so declaring a schema still constructs nothing on import.

```ts
const cart = defineChannel<{ 'item:add': Item }>('cart', {
  schema: { 'item:add': itemSchema },
});
```

Redefining with the same set of validated keys is a no-op, because Fast Refresh re-runs the defining module and rebuilds the schema objects on every edit — identity comparison would call a change that alters nothing a conflict. A genuine change after the channel exists warns, and the live channel keeps what it was built with.

Also re-exports the `StandardSchemaV1`, `SchemaMap`, `SchemaOptions`, `InvalidPayload` and `OnInvalid` types from core.

Three size budgets move up: `useSharedState`, `useChannel + useMessage + useSend` and `defineStore (persisted)`, tracking the core engines beneath them.
