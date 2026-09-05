---
title: 'Stability policy'
description: 'What use-everywhere promises not to break, and what it reserves the right to change — written before 1.0, in effect since it.'
sidebar:
  order: 7
---

What this library promises not to break, and what it reserves the right to
change. Written before 1.0 rather than after, because a promise made in a
changelog after the fact is not one.

:::note[In effect since 1.0]
Every release from 1.0.0 on is held to this contract. The renames that landed
with 1.0 itself are listed in [Migrating to 1.0](../guides/migration.md).
:::

## What "public API" means

Exactly three things:

1. **The named exports of each package's entry points.** Every export is
   enumerated by hand in `index.ts` rather than re-exported with `export *`,
   which is deliberate: it means nothing becomes public by accident. If it is
   not in that list, it is not API, however reachable it is.
2. **The subpath entry points**: `use-everywhere/devtools`,
   `use-everywhere/testing`, `@use-everywhere/core/testing`. Same rule inside
   each.
3. **The wire protocol**, versioned separately — see below.

Deliberately _not_ public, and changeable in a patch:

- Internal module paths. `import … from 'use-everywhere/dist/registry.js'` is
  not a supported import, and the `exports` map exists to stop it resolving.
- The **text** of development warnings. Their [codes](../errors.md) are
  permanent; the prose around them is not.
- The Inspector's markup, class names, and appearance. It is a devtool, its
  entry point is separate, and no production bundle contains it.
- Anything the type system marks `@internal`.
- Timing that is not a documented option: how long a jittered snapshot reply
  waits, how often presence probes a quiet peer.

## Semver, as applied here

**Patch** — bug fixes, performance, warning wording, docs. No new API.

**Minor** — new exports, new options, new optional behaviour. Existing code
keeps working, and existing state on the wire keeps interoperating.

**Major** — anything else. A renamed export, a changed default, a removed
option, a new wire protocol version.

Two specifics worth stating, because they are where libraries usually cheat:

- **Changing a default is a major.** Defaults are behaviour, and "we only
  changed the default" has broken more apps than most renames.
- **Making a value stricter is a major.** If `set()` starts rejecting something
  it used to accept — even something it should always have rejected — that is a
  break, and it gets a major and a migration note.

## Experimental API

Anything shipped for feedback rather than for keeps carries an
`experimental_` prefix, React's convention: `experimental_useThing`. Such an
export can change or disappear in a **minor**, and the prefix is the notice.

Renaming it _is_ the graduation — `experimental_useThing` becoming `useThing` is
a minor that adds the stable name, followed by a major that removes the prefixed
one. Nothing here is `experimental_` today.

## The wire protocol

The one contract that is not about your code. `WIRE_VERSION` is **1**.

Two builds of your app can meet in one browser profile — a tab opened before a
deploy and a tab opened after — and what happens then is specified:

- **Same wire version:** they interoperate. A minor upgrade is safe to deploy
  while old tabs are open, which is the point of versioning the protocol
  separately from the package.
- **Different wire version:** they partition, **loudly**. Foreign messages are
  dropped rather than misread, and the [`UE1007`](../errors.md) warning names
  both versions. A partition you can see beats a merge you cannot.

Therefore: **a minor never bumps the wire version.** Additive, within-version
evolution — a new optional field on an existing message — is a minor, and older
builds ignore what they do not recognise. Anything that changes how an existing
message is _read_ is a wire bump, and a major.

See [Version skew](./version-skew.md) for what a partition looks like from
inside an app, and how to detect it.

## Browsers

Every release runs the full end-to-end suite on **three engines** — Chromium,
Firefox, and WebKit — as three separate CI jobs, so a WebKit failure is
readable without scrolling past two passes. The unit suites additionally run
against React 18 and 19.

| Environment                         | What holds                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium, Firefox, WebKit (current) | Fully supported, tested per commit                                                                                                             |
| Safari private browsing             | Degrades loudly. No usable storage means no transport; `getTransportKind()` returns `'none'` and [`UE1010`](../errors.md) warns                |
| Plain-http origins                  | Supported. No secure context means no Web Locks, so leadership falls back to the heartbeat election — not a legacy path, it is what runs there |
| Web Workers, SharedWorker           | Supported; a worker announces itself with `kind: 'worker'`                                                                                     |
| Server (SSR)                        | Renders inert. No bus, no heartbeat, no election, and `useClientId` has an empty-string server snapshot — treat `''` as "not known yet"        |

Support for an engine is dropped only in a **major**, and only for a version
that is out of its vendor's own support window.

## Node

The published packages target browsers, but they are imported in Node
constantly — during SSR, and in every test run. Node's own `BroadcastChannel`
means the primitives work there too, which is what the benchmark suite measures.
The supported floor is the **active LTS**, and raising it is a minor rather than
a major: it is a build-time requirement, not a runtime API.

## Deprecation

Nothing is removed without warning first. Concretely:

1. A deprecation lands in a **minor**: the old name keeps working, forwards to
   the new one, and warns once in development with a code and this page's
   sibling entry.
2. It stays for **at least two minors**, and never less than three months.
3. Removal happens in the next **major**, listed in the migration guide.

Where the change is mechanical, the major ships a codemod. Where it is not, the
migration guide spells out the edit.

## Security fixes

Reported privately (see [SECURITY.md](https://github.com/rxova/use-everywhere/blob/main/SECURITY.md)),
fixed on the **current minor**, and released as a patch. Older minors are not
backported.

That is a real limitation of a small project rather than a preference, and it is
stated plainly so nobody plans around a guarantee that does not exist. Staying
on the current minor is cheap, deliberately: the wire protocol makes minors
interoperate, so upgrading does not require every tab to reload at once.

## What is not promised

- **A support window for old majors.** When 2.0 arrives, 1.x gets security
  patches for a stated period announced with the release — not an open-ended
  LTS.
- **Bundle sizes as a contract.** Every export has a size budget in CI and a
  regression fails the build, but the numbers themselves are engineering
  targets, not promises.
- **Absolute performance.** The [benchmarks](./benchmarks.md) gate _ratios_
  against a raw `BroadcastChannel`; no millisecond figure is a commitment.
- **Ordering across keys.** Each key converges by last-writer-wins with its own
  version clock. Two keys written together may be observed apart —
  `store.transaction()` batches the local notification, not the wire. This is
  documented behaviour, not a gap to be closed later.
