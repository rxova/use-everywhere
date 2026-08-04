---
'use-everywhere': patch
---

Keep development warnings out of production bundles.

The same change as core: every `devWarn` call site now carries the literal `process.env.NODE_ENV !== 'production'` guard, so a bundler folds the branch and drops the string with it.

`useSharedState` guards the whole `warnOnInitialMismatch` call rather than returning early inside it. With the branch folded away the function is unreferenced, so the bundler drops it, its Map of seen initials, and its message together — an early return would have kept all three.

Every size budget is retightened to the new measurement, most of them **below where they stood before this stack started**, despite the features that landed on it.

A browser loading this ESM directly, with no bundler to define `process`, now throws a `ReferenceError`. Bundle the package, or shim `process.env.NODE_ENV`. See the core changeset for why the `typeof` guard that would avoid this was rejected.
