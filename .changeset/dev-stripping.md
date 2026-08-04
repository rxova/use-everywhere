---
'@use-everywhere/core': patch
---

Keep development warnings out of production bundles.

Every warning string was shipping to every user. `devWarn` checked `NODE_ENV` at runtime, so the _call_ was inert in production — but the message was built at the call site, so the string itself was in the bundle regardless. Four consecutive features paid 150–300 B each for this before the pattern was named, and the pressure ran the wrong way: every new warning was an argument for writing a terser warning.

Each call site now carries the guard literally:

```ts
if (process.env.NODE_ENV !== 'production') {
  devWarn(`[use-everywhere] …`);
}
```

Written out rather than hidden behind a shared constant, because a bundler can only fold what it can see. It replaces `process.env.NODE_ENV` with `"production"`, the branch becomes statically false, and the string goes with it. In React's `useSharedState` the guard wraps the whole `warnOnInitialMismatch` call, so the bundler drops the function, its Map of seen initials, and its message together.

Measured on the real entry point, bundled the way a production app bundles it: **594 B brotlied**, 12 of 12 warnings gone. Two messages deliberately stay — a thrown `Error` a caller can catch, and the report of a throwing debug observer, which is a real fault being contained rather than a diagnostic.

Every size budget is retightened to the new measurement. Most are now **lower than before this stack started**, despite three features having landed on it.

`dev-stripping.test.ts` pins the guarantee: it bundles `src/index.ts` twice, once as development and once as production, and fails naming any warning that survives. A budget can notice that a bundle grew; it cannot say why, which is how this went unnoticed for four releases. A companion runtime test covers the production arm of each guard — Vitest runs with `NODE_ENV=test`, so without stubbing, the arm every real user takes is never executed.

**One trade worth knowing.** A browser loading this ESM directly, with no bundler to define `process`, now throws a `ReferenceError`. Prefixing `typeof process !== 'undefined'` would prevent that, but esbuild does not fold it away — measured, not assumed — which would leave a dead branch in every production bundle and an untestable one in coverage. Bundle the package, or shim `process.env.NODE_ENV`.
