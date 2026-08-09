# eslint-plugin-use-everywhere

## 0.1.1

### Patch Changes

- [#81](https://github.com/rxova/use-everywhere/pull/81) [`1359739`](https://github.com/rxova/use-everywhere/commit/13597395e79859e4c72c10146e1ce1825c67c9f6) - Ship an `llms.txt` in the package tarball. It is what a coding agent reads out of `node_modules` after an install: what the package is, how to install it, a working example, the public surface, and the mistakes that are silent at runtime. `check-llms.ts` checks its API table against the package's real entry points, so a renamed export fails the build rather than leaving the file describing an API that no longer exists.

- [#84](https://github.com/rxova/use-everywhere/pull/84) [`3edf05b`](https://github.com/rxova/use-everywhere/commit/3edf05bfac57c6e023ef1b0a1b6fb863a91efb66) - Point `homepage` at the ESLint plugin overview, and broaden `keywords`.

  `homepage` is the link npm renders on the package page, so it was sending everyone who arrived from the registry to a README instead of the documentation. The keywords described the mechanism (`broadcastchannel`, `cross-tab`) but not the problem, so none of them matched what someone with the bug actually searches for — added the vocabulary that side uses, plus `broadcast-channel`, which npm treats as a different term from the unhyphenated spelling already listed.

## 0.1.0

### Minor Changes

- [#64](https://github.com/rxova/use-everywhere/pull/64) [`7c9d853`](https://github.com/rxova/use-everywhere/commit/7c9d85315647af19f19d050079887d315cb75d04) - First release: four rules for the mistakes that are silent at runtime.

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
