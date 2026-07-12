---
sidebar_position: 1
---

# Hooks overview

The React package ships ten hooks, and each one answers exactly one
question. This section gives every hook its own page: what it is in plain
English, every option it takes, what it returns, a worked example, and the
gotchas worth knowing before you hit them.

| Hook                                        | The question it answers                         | In one line                                                        |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| [`useSharedState`](./use-shared-state.md)   | "What is the current value?"                    | `useState`, but the value exists in every tab on your origin       |
| [`useChannel`](./use-channel.md)            | "Give me the typed event channel named X"       | Returns the page-wide channel singleton for a name                 |
| [`useMessage`](./use-message.md)            | "Run this when X happens in another tab"        | Subscribes to one event type, with no stale-closure traps          |
| [`useSend`](./use-send.md)                  | "Let me announce X to every other tab"          | A stable, typed `post` function for a channel                      |
| [`usePeers`](./use-peers.md)                | "Who else is here?"                             | A live list of open tabs, windows, and workers                     |
| [`useClientId`](./use-client-id.md)         | "Which one am I?"                               | This tab's stable id on a bus — matches `meta.clientId` everywhere |
| [`useOpenedWindow`](./use-opened-window.md) | "Open a window on another domain and hear back" | The whole cross-origin window lifecycle as render state            |

There are also two factories. [`defineChannel`](./define-channel.md) binds a
channel's name and message map once at module level and returns ready-made
`useSend`/`useMessage` — the ergonomic way to use the event trio across many
components. [`defineStore`](./define-store.md) does the same for a store, and
is where you turn on [persistence](./define-store.md) so the state survives
closing the last tab.

And when it misbehaves, [`<Inspector />`](./inspector.md) shows you every
message crossing the bus, in both directions.

Three things hold for all of them:

1. **There is no Provider.** A BroadcastChannel is already global to the
   origin — its identity _is_ the name string — so a React context couldn't
   scope it any further. The hooks share module-level singletons per name,
   built on `useSyncExternalStore`, and you just call them.
2. **Everything is typed end to end.** You declare a message map or a state
   type once; every `post`, `on`, and setter is checked against it.
3. **SSR works out of the box.** Hooks render initial values on the server
   and converge right after hydration; nothing throws where
   `BroadcastChannel` doesn't exist.

Not sure whether something belongs in state or in an event? Same test as
always:

:::tip The litmus test
If a tab opened later needs to know it, it's **state** —
[`useSharedState`](./use-shared-state.md). If only currently-open tabs care,
it's an **event** — [`useMessage`](./use-message.md).
:::

## Beyond the hooks

Installing `use-everywhere` re-exports the entire framework-agnostic core, so
it's one dependency for everything — the engines the hooks are built on
(`createSharedStore`, `createLeader`, …), the version clock (`newer`), the
transports, and the debug seam. None of it needs React.

That's its own section: **[Core API](../core/overview.md)**.

## Where to next

- [`useSharedState`](./use-shared-state.md) — start here; it's the headline
  act.
- [The mental model](../learn/mental-model.md) — the two ideas these hooks
  are a surface for.
- [Recipes](../guides/recipes.md) — the hooks combined into real features.
