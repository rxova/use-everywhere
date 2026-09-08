# use-everywhere-codemod

The codemod for the [use-everywhere](https://github.com/rxova/use-everywhere)
1.0 renames. Five exports and three types changed name between `0.x` and 1.0
([RFC 0001](https://github.com/rxova/use-everywhere/blob/main/rfcs/0001-naming-sweep.md));
this rewrites a codebase from the old spellings to the new ones, and changes
nothing else.

```sh
npx use-everywhere-codemod rename-1.0 src/
```

| `0.x`                | 1.0                       |
| -------------------- | ------------------------- |
| `useMessage`         | `useOnMessage`            |
| `useOpenedWindow`    | `useWindowResult`         |
| `defineStore`        | `createStoreHooks`        |
| `useSharedStore`     | `useSharedSelector`       |
| `StoreHooks.get()`   | `StoreHooks.store()`      |
| `UseMessageOptions`  | `UseOnMessageOptions`     |
| `DefineStoreOptions` | `CreateStoreHooksOptions` |
| `UseOpenedWindow`    | `UseWindowResult`         |

The hook `defineChannel` hands back is renamed with the standalone one:
`shop.useMessage(...)` becomes `shop.useOnMessage(...)`.

## What it does

Pass files or directories. Directories are walked for `.ts`, `.tsx`, `.js`,
`.jsx`, `.mjs`, `.cjs`, `.mts` and `.cts`; `node_modules` and dot-directories
are skipped. `--dry-run` lists what would change and writes nothing.

The transform edits identifiers in place over the TypeScript syntax tree, so
formatting, comments and every other byte come back exactly as they were — the
diff is the renames and only the renames. It covers:

- `import { useMessage } from 'use-everywhere'` and every reference to the
  binding. An aliased import (`useMessage as onMessage`) changes only the
  imported name; the alias keeps working.
- `import * as ue` and `require('use-everywhere')`, in both destructured and
  whole-module form.
- `export { useMessage } from 'use-everywhere'` in a barrel, rewritten as
  `export { useOnMessage as useMessage }` so the barrel's own surface is
  untouched.
- `StoreHooks.get()`, `ChannelHooks.useMessage()` and the `ReactNamespace`
  members, wherever the receiver was built from the factory in the same file
  (or is the factory call itself). `.defineStore` and `.useSharedStore` are
  distinctive enough to rename on any receiver that is not a namespace import
  of another module.

## What it leaves for you

A `.useMessage(...)` call on a receiver the transform cannot attribute — a
channel imported from another file — is reported, not rewritten:
`message.useMessage()` is antd, and `.get()` is every `Map`, so neither can be
renamed on shape alone. The command prints each one with its file and line.

Values are not typed, so a hook stored under a different name
(`const listen = useMessage`) is renamed at the assignment and nowhere else,
which is correct: `listen` is still `listen`.

## Programmatic use

```ts
import { transform } from 'use-everywhere-codemod';

const { source, changed, warnings } = transform(code, 'Cart.tsx');
```

`run({ paths, dryRun, cwd })` is the same walk the command line performs.

## Docs

- [Migrating to 1.0](https://rxova.org/packages/use-everywhere/guides/migration/)
- [RFC 0001 — naming sweep](https://github.com/rxova/use-everywhere/blob/main/rfcs/0001-naming-sweep.md)

## License

MIT
