---
title: 'Error codes'
description: 'Every diagnostic use-everywhere prints, with its code, what triggers it, and how to fix it.'
sidebar:
  order: 9
---

Every diagnostic this library prints carries a code and a link to its entry
here:

```
[use-everywhere] UE1001: second shared store for "cart" in this tab — …
  → https://rxova.org/packages/use-everywhere/errors/#ue1001
```

The code is the durable part. A message can be reworded between versions,
mangled by a minifier, or truncated by a log aggregator; `UE1001` survives all
three, and it is what you paste into a search box or an issue.

**Codes are permanent.** A retired one is never reused — an old build in
somebody's browser is still emitting it.

Almost everything here is a **development-only warning**: the call sites are
guarded so a production bundle contains neither the check nor the string, which
is enforced by a test that bundles the library and looks. The two exceptions are
marked.

`UE1xxx` comes from `@use-everywhere/core`, `UE2xxx` from the React package.
`UE9xxx` is reserved for test fixtures — the suites invent codes in that band to
exercise the warning plumbing itself, and the library never emits one. If you
see a `UE9xxx` in an application, it did not come from here.

---

## UE1001

**Second shared store for this name in this tab.**

Two live `createSharedStore` calls for one name in one tab. They stay in sync —
they share a bus — but you are paying twice for the same state, the same
subscriptions and the same persistence writes.

**Fix:** create one store per name and pass it around, or use `defineStore` and
the hooks, which memoize on the name for you.

## UE1002

**Persisted state was not restored.**

What is on disk was written by a different schema version, and no `migrate`
turned it into this one. The store kept its initial values, which is a usable
store — so this is a warning, not a throw.

**Fix:** give `persist` a `version` and a `migrate`, or accept the reset and
pass `onRestoreError` to say so deliberately. See
[Persistence](./guides/persistence.md).

## UE1003

**A payload was rejected by its schema.**

A message arrived (or was about to be sent) that its schema refused. It was
dropped rather than delivered.

Inbound, this is usually version skew: a tab on an older deploy sending the
shape it knew. Outbound, it is a bug in the sender.

**Fix:** handle it explicitly with `onInvalid` — telling the user to reload is
often the right answer — and see [Validating payloads](./guides/validating-payloads.md).

## UE1004

**`heartbeatMs` ignored.**

The bus for this name already exists, and the first creator fixes its options. A
later call asking for a different heartbeat is not applied.

**Fix:** set bus options at the first call site, or accept the existing bus's
timings. This is origin-wide state; a second opinion about it is a bug either
way.

## UE1005

**`kind` ignored.**

Same as UE1004, for the `kind` a client announces itself as (`tab`, `worker`, or
your own string). The first creator wins.

## UE1006

**`crypto.getRandomValues` is unavailable.**

Client ids and cross-origin window nonces fell back to `Math.random`. Practically
unreachable in a browser; you are on an exotic host (an unpolyfilled JS engine).

**Why it warns rather than staying quiet:** the window channel's nonce is a
security boundary, and a security property that silently downgrades is worse
than one that fails loudly.

**Fix:** polyfill `crypto.getRandomValues`, or do not use the cross-origin
window channel on that host.

## UE1007

**A peer speaks a different wire protocol version.**

Another tab is running a different deploy of your app, built against a different
wire protocol. Its messages are dropped: the two tabs cannot share state,
presence, or a leader seat.

This is normal _during_ a deploy and a bug if it persists.

**Fix:** nothing, if it is transient — but prompt the user to reload rather than
leaving them with a page that has silently stopped syncing. See
[Version skew](./under-the-hood/version-skew.md).

## UE1008

**Two incompatible versions of this library on one page.**

Two bundled copies whose rendezvous protocols differ. They still sync over the
bus, but they do not share a client identity: expect one presence entry per
version, and no synchronous delivery between them.

**Fix:** align the versions. Usually a deduplication problem — two
micro-frontends pinning different majors, or a lockfile with two entries.

## UE1009

**No `BroadcastChannel`; using the storage-event fallback.**

Sharing still works, at lower fidelity: values are serialised as **JSON**, not
structured clone. `Date`, `Map`, `Set` and `undefined` do not survive the round
trip the way they do on the real transport.

**Fix:** keep shared values JSON-shaped where this fallback can be reached, and
see [Transports](./core/transports.md).

## UE1010

**Nothing is shared between tabs.**

No `BroadcastChannel` _and_ no usable `localStorage`. Every write is local and
no peer will ever see it. Storage is almost certainly blocked — Safari private
browsing, a strict cookie policy, or an embedded context with storage access
denied.

**Fix:** detect it and tell the user, rather than showing them an app that looks
like it works. `getTransportKind(name)` returns `'none'` here — check it once at startup and
say so.

## UE1011

**`StorageTransport` needs `localStorage`.**

**This one throws, in every build.** You constructed a `StorageTransport`
directly somewhere without `localStorage` — a worker, most likely.

**Fix:** use `BroadcastChannel` there. `defaultTransport` probes before choosing,
so this only reaches you if you picked the transport by hand.

## UE1012

**A bus observer threw.**

**Reported in every build**, as a `console.error`. A debug observer — devtools,
or your own `observeBus` — threw inside the bus's hot path. It was contained:
the post or the receive it was watching completed.

**Fix:** the bug is in the observer. A spectator must never break the thing it
watches, which is why this is contained rather than propagated.

---

## UE2001

**`useSharedState` called with different initial values.**

Two call sites registered one key with different defaults. The first
registration wins and the second is discarded — which surfaces much later as
"why is this value not what I set".

**Fix:** define the default once. `defineStore`, or a shared constant.

## UE2002

**`defineStore` ran after that store was created.**

The live store keeps the configuration it was built with, so the persistence (or
scope, or options) you just declared is not applied.

**Fix:** move `defineStore` to module scope, before any component reads the
store. The [`define-at-module-scope`](./eslint/define-at-module-scope.md) lint rule
catches this before it runs.

## UE2003

**Leader option ignored.**

The first `useLeader` or `getLeader` call fixes the election timings for the
tab. A later call asking for a different `heartbeatMs` or `leaseMs` is not
applied.

**Fix:** configure leadership at one call site — election timing is a property
of the tab, not of a component.

## UE2004

**`defineChannel` ran after that channel was created.**

As UE2002, for channels: the live channel keeps the schema and options it was
built with.

**Fix:** move `defineChannel` to module scope, before any component sends or
receives on it.
