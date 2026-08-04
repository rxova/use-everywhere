---
title: 'ESLint plugin'
sidebar:
  order: 1
---

Most of what this library can get wrong, it tells you about: conflicting
initials, two stores on one name, a payload that fails its schema, a transport
that degraded — all of them warn in development with an error code.

Four mistakes cannot warn, because from the inside they are indistinguishable
from correct use. A store defined inside a component looks like a store defined
anywhere else. A bus name built from a variable is a perfectly good name. A
function in shared state is a value like any other until the moment it has to
cross the wire. Those four are what this plugin is for.

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

The config carries no `files` filter, so put it after any `files` block of your
own if the project mixes languages.

## The rules

| Rule                                                    | Recommended | What it catches                                                       |
| ------------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| [`define-at-module-scope`](./define-at-module-scope.md) | error       | `defineStore` / `defineChannel` / `createNamespace` inside a function |
| [`no-dynamic-name`](./no-dynamic-name.md)               | error       | A bus name computed at runtime                                        |
| [`structured-clone-safe`](./structured-clone-safe.md)   | error       | Functions, symbols and class instances in shared state                |
| [`leader-effect-captures`](./leader-effect-captures.md) | warn        | A `useLeaderEffect` closing over a value that changes between renders |

Three are errors: each produces a page that renders, syncs nothing, and says
nothing. The fourth is a warning, because a captured value that never actually
changes is harmless and no syntactic rule can tell the difference — it argues
rather than blocks.

## What it deliberately does not do

The rules are syntactic. They read the shape of your code, not its types, which
means no `parserOptions.project`, no typed-linting cost, and no opinion about
values it cannot see:

```ts
useSharedState('cart', initialFromProps); // not judged — nothing to read
```

They match on call names, including through a namespace
(`checkout.defineStore(…)`), so any object with a `defineStore` method is
treated as ours. The names are distinctive enough that the trade is worth it.

They also do not replace `eslint-plugin-react-hooks`. Every hook here is a real
hook: rules-of-hooks and exhaustive-deps still apply, and the recommended config
assumes you run them.
