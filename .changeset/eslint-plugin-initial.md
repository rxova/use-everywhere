---
'eslint-plugin-use-everywhere': minor
---

First release: four rules for the mistakes that are silent at runtime.

`define-at-module-scope` catches a definer inside a component, where only the
first registration takes effect. `no-dynamic-name` catches a bus name computed
at runtime, which forks the bus without warning. `structured-clone-safe` catches
functions, symbols and class instances in shared state, which either throw on
write or arrive with their prototype dropped. `leader-effect-captures` warns
when a `useLeaderEffect` closes over a value that changes between renders, since
the effect re-runs only when leadership moves.

Flat config, ESLint 9+, no type information required:

```js
import useEverywhere from 'eslint-plugin-use-everywhere';

export default [useEverywhere.configs.recommended];
```
