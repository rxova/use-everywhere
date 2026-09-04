# eslint-plugin-use-everywhere

ESLint rules for [use-everywhere](https://github.com/rxova/use-everywhere).

Four rules, one theme: **the mistakes that are silent at runtime**. A store
defined inside a component still renders. A bus name built from a variable still
returns a store. A function in shared state looks fine until the write throws in
one tab and not the others. None of these produce a stack trace pointing at the
line that caused them — so they are lint's job.

```sh
pnpm add -D eslint-plugin-use-everywhere
```

```js
// eslint.config.js
import useEverywhere from 'eslint-plugin-use-everywhere';

export default [
  // …your config
  useEverywhere.configs.recommended,
];
```

The config carries no `files` filter, so place it after any `files` block of
your own if the project mixes languages.

## Rules

| Rule                                                                                                 | Recommended | What it catches                                                            |
| ---------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| [`define-at-module-scope`](https://rxova.org/packages/use-everywhere/eslint/define-at-module-scope/) | error       | `createStoreHooks` / `defineChannel` / `createNamespace` inside a function |
| [`no-dynamic-name`](https://rxova.org/packages/use-everywhere/eslint/no-dynamic-name/)               | error       | A bus name computed at runtime                                             |
| [`structured-clone-safe`](https://rxova.org/packages/use-everywhere/eslint/structured-clone-safe/)   | error       | Functions, symbols and class instances in shared state                     |
| [`leader-effect-captures`](https://rxova.org/packages/use-everywhere/eslint/leader-effect-captures/) | warn        | A `useLeaderEffect` closing over a value that changes between renders      |

`leader-effect-captures` is a warning on purpose: a captured value that never
actually changes is harmless, and no syntactic rule can tell the difference.

Turning a rule off is one line:

```js
export default [
  useEverywhere.configs.recommended,
  { rules: { 'use-everywhere/leader-effect-captures': 'off' } },
];
```

## Requirements

ESLint 9 or later, flat config. Rules are syntactic — no type information, so
no `parserOptions.project` and no typed-linting cost.

## License

MIT © [Jonatan Kruszewski](https://github.com/rxova)
