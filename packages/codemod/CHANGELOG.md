# use-everywhere-codemod

## 0.2.0

### Minor Changes

- [#143](https://github.com/rxova/use-everywhere/pull/143) [`1cc5d88`](https://github.com/rxova/use-everywhere/commit/1cc5d88217ded942273f621b1359c8da0e4317a4) - `use-everywhere-codemod --version` (or `-v`) prints the installed version and exits.

### Patch Changes

- [#149](https://github.com/rxova/use-everywhere/pull/149) [`af63cca`](https://github.com/rxova/use-everywhere/commit/af63ccab31bd8be074925af5fa57517263bfbef0) - Point links at rxova.dev

## 0.1.1

### Patch Changes

- [#126](https://github.com/rxova/use-everywhere/pull/126) [`00038c2`](https://github.com/rxova/use-everywhere/commit/00038c22c1b7e6e0c892d7ac3aba7bf765cb832a) - Build with tsdown instead of tsup. The published output is unchanged: same dual ESM + CJS shape, same `.js`/`.cjs` filenames, same declarations.

## 0.1.0

### Minor Changes

- [#116](https://github.com/rxova/use-everywhere/pull/116) [`0ccf1ed`](https://github.com/rxova/use-everywhere/commit/0ccf1ed6e158c069792076d4134b087eaa8e114b) - First release. `npx use-everywhere-codemod rename-1.0 src/` rewrites a `0.x` codebase to the 1.0 names, including the `StoreHooks.get()` and `ChannelHooks.useMessage` member renames. `--dry-run` lists what would change without writing anything.
