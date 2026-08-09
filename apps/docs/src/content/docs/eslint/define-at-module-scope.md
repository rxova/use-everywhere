---
title: 'define-at-module-scope'
description: 'Requires defineStore, defineChannel and createNamespace to be called at module scope, so a bus identity stays stable across renders.'
sidebar:
  order: 2
---

**Recommended: error.** Requires `defineStore`, `defineChannel` and
`createNamespace` to be called at the top level of a module.

## Why

The definers do not construct anything. They register the options a name will
be built with, and hand back hooks bound to that name; the store or channel
itself is created the first time something needs it. That design is what lets
`defineStore('settings', { persist })` sit at the top of a module without
opening a bus on import.

It also means the registration has to happen **before** the first use. Module
evaluation always precedes render, so a definer at module scope is early by
construction. Inside a component it is not:

```tsx
// ✗ Runs on every render, after the store may already exist.
function Settings() {
  const settings = defineStore('settings', { persist: localStorageAdapter() });
  const [theme, setTheme] = settings.useSharedState('theme', 'dark');
}
```

The first registration wins. If the store was already created — by a sibling
component, an earlier render, or a different module — this call either warns or
throws depending on what it tried to change, and in the quiet case it simply
does nothing. Persistence you thought you configured is not configured.

The returned hooks object is also a fresh identity on every render, so anything
memoizing on it re-subscribes each time.

## Correct

```tsx
const settings = defineStore('settings', { persist: localStorageAdapter() });

function Settings() {
  const [theme, setTheme] = settings.useSharedState('theme', 'dark');
}
```

A definer inside a module-scope `if` is fine — a block still evaluates once:

```ts
if (import.meta.env.DEV) defineChannel('debug');
```

## When not to use it

If you build stores dynamically from a config loaded at runtime, you are outside
what the registry guarantees; disable the rule for that module and make sure
nothing touches those names before the loop runs.
