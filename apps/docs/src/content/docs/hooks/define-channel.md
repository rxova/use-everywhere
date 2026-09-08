---
title: 'defineChannel'
description: "Bind a channel's name and message map once at module level, and get typed useSend and useOnMessage hooks back."
sidebar:
  order: 6
---

`defineChannel` binds a channel's name and message map **once, at module
level**, and hands back ready-to-use typed hooks. It's sugar over
[`useChannel`](./use-channel.md) + [`useOnMessage`](./use-on-message.md) +
[`useSend`](./use-send.md) for when the trio feels like ceremony: declare the
channel in one file, and every component gets two-line usage with no
generics and no name strings to repeat.

```ts title="shop-channel.ts"
import { defineChannel } from 'use-everywhere';

type ShopEvents = { 'cart-updated': { items: number } };

export const shop = defineChannel<ShopEvents>('shop');
```

```tsx title="CartBadge.tsx"
import { useState } from 'react';
import { shop } from './shop-channel';

function CartBadge() {
  const [items, setItems] = useState(0);
  const send = shop.useSend();

  shop.useOnMessage('cart-updated', (p) => setItems(p.items)); // other tabs

  const addToCart = () => {
    setItems(items + 1); // 1. this tab, explicitly
    send('cart-updated', { items: items + 1 }); // 2. every other tab
  };

  return <button onClick={addToCart}>Cart ({items})</button>;
}
```

Compare with [the same component built from the trio](./use-send.md#worked-example-update-yourself-then-tell-everyone):
the behavior is identical — this version just moved the name and the type
parameter out of the component and into the channel's own module.

## Signature

```ts
function defineChannel<M extends MessageMap>(name: string): ChannelHooks<M>;
```

Not a hook — a plain factory, meant to run at module scope. It lives in the
React package only (`use-everywhere`, not `@use-everywhere/core`), because
what it returns is hooks.

## Return value

| Member         | Type                            | What it is                                                                                       |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `useSend`      | `() => (type, payload) => void` | The bound channel's `post`, stable identity — same contract as [`useSend`](./use-send.md).       |
| `useOnMessage` | `(type, handler) => void`       | Subscribe to one event type — same freshness contract as [`useOnMessage`](./use-on-message.md).  |
| `get`          | `() => Channel<M>`              | The underlying channel instance, for code outside React (module-level handlers, workers, tests). |

## Everything stays shared

`defineChannel` creates no new machinery. It resolves to the same page-wide
channel singleton the standalone hooks use, so all of these are on one wire
and can be mixed freely:

```ts
const bound = defineChannel<ShopEvents>('shop');

bound.get() === getChannel('shop'); // same instance
useChannel<ShopEvents>('shop'); // same instance, in a component
defineChannel<ShopEvents>('shop').get(); // same instance again
```

Two modules calling `defineChannel('shop')` independently talk to each other
— the name is still the identity, exactly like everywhere else in the
library.

## Gotchas

- **Call the returned hooks like hooks.** `shop.useSend()` and
  `shop.useOnMessage(...)` follow the Rules of Hooks — top level of a
  component, unconditionally. The `namespace.useX(...)` call shape is fully
  understood by `eslint-plugin-react-hooks`.
- **Don't rename them during destructuring.** `const { useOnMessage } = shop`
  is fine; `const { useOnMessage: onCart } = shop` hides the hook from the
  linter. Calling through the namespace (`shop.useOnMessage`) sidesteps the
  question entirely.
- **Same semantics as the trio.** No echo to the sender, no history,
  at-most-once delivery — everything on the
  [`useOnMessage`](./use-on-message.md#gotchas) and
  [`useSend`](./use-send.md#gotchas) pages applies unchanged.

## Where to next

- [`useChannel`](./use-channel.md) / [`useOnMessage`](./use-on-message.md) /
  [`useSend`](./use-send.md) — the standalone trio this wraps.
- [Messages & presence guide](../guides/messages-and-presence.md) — the
  event system in a full feature.
