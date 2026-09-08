---
title: 'no-dynamic-name'
description: 'Requires a bus name to be a string literal or a module-scope constant, so a channel identity cannot change between renders.'
sidebar:
  order: 3
---

**Recommended: error.** Requires the name passed to a bus factory to be a string
literal, a module-scope `const` string, or an imported binding.

Covers `createStoreHooks`, `defineChannel`, `createNamespace`, `createSharedStore`,
`createSharedReducer`, `createChannel`, `createPresence`, `createLeader`,
`getSharedStore` and `getLeader`.

## Why

A bus name is an identity. Two tabs meet because they computed the same string;
they miss each other because they did not. There is no handshake that can tell
the difference — a tab on `cart-v2` and a tab on `cart-v3` are simply two
separate, perfectly healthy buses, each convinced it is alone.

```tsx
// ✗ One bus per host, per build, per whatever this evaluates to.
const cart = createStoreHooks(`cart-${window.location.host}`);
```

The failure is invisible in every environment where you would notice it. In
development both tabs are the same host and the same build, so it works. It
breaks in production, between a tab loaded before a deploy and a tab loaded
after, or between `www.` and the apex domain — and it breaks silently: no
error, no warning, just state that stops travelling.

Deliberate versioning of a name is a real thing to want. It just has to be
static, so that the string is a fact about the build rather than about the
moment the call ran.

## Correct

```ts
createStoreHooks('cart');

const CART = 'cart';
createSharedStore(CART, {});
```

A shared constants module is the shape this rule is nudging you toward, and an
imported binding counts without being followed:

```ts
// names.ts
export const CART = 'cart';

// anywhere.ts
import { CART } from './names';
const cart = createStoreHooks(CART);
```

## Keys are not names

A dynamic **key** inside one store is supported and documented — every tab still
lands on the same bus, and the keys are just entries in it:

```tsx
useSharedState(`row-${id}`, null); // fine
```

Only the name, which chooses the bus itself, has to be static.

## When not to use it

Per-tenant or per-document buses whose name genuinely comes from the URL are a
legitimate pattern — a collaborative editor keyed by document id, for example.
Disable the rule at those call sites, and make the derivation somewhere both
tabs provably agree on (the pathname, not the hostname, and never the build).
