# @use-everywhere/core

## 0.10.1

### Patch Changes

- [#71](https://github.com/rxova/use-everywhere/pull/71) [`d97248b`](https://github.com/rxova/use-everywhere/commit/d97248b1cbdb8a431783ef37a96a69296230d425) - Let a Web Locks tab rejoin the queue after it withdraws from it

  `joinQueue()` published the lock's release handle when the _request_ was made
  rather than when the browser _granted_ it, so a tab merely queued behind the
  holder looked like a holder itself. Withdrawing (`setEligible(false)`) aborted
  the queued request but had no lock to let go of, leaving that handle behind —
  and the guard in `joinQueue()` then refused to put the tab back in line when it
  opted in again. A follower that toggled eligibility off and on was out of the
  running for good, and the seat could be left empty when the holder went away.

  The handle is now assigned inside the grant callback, where the lock is
  genuinely held.

## 0.10.0

### Minor Changes

- [#65](https://github.com/rxova/use-everywhere/pull/65) [`6c7ab4b`](https://github.com/rxova/use-everywhere/commit/6c7ab4bac60f360f65c5fd2dfacd02fba55b3274) - Add `SharedWorkerTransport` and the relay it talks to (`@use-everywhere/core/shared-worker`), so a bus can run through one worker per origin instead of a channel between N tabs. The point is a place that is not a tab: the relay can own the socket that leadership used to be needed for. Opt-in — `BroadcastChannel` stays the default — and `isSharedWorkerAvailable()` reports the contexts (dedicated workers, Chrome for Android) where the constructor would throw.

## 0.9.0

### Minor Changes

- [#64](https://github.com/rxova/use-everywhere/pull/64) [`9aa146f`](https://github.com/rxova/use-everywhere/commit/9aa146fbe9d6ada23377e8e1e3645657754bcb04) - Export the `LockManagerLike` type, and document `LeaderOptions.locks` as the
  supported test seam it now is: `@use-everywhere/test-utils` passes a
  `FakeLockManager` there so several simulated tabs can queue on one seat, and so
  a crashed tab's lock is reclaimed, in a plain test process.

- [#64](https://github.com/rxova/use-everywhere/pull/64) [`2ee96f4`](https://github.com/rxova/use-everywhere/commit/2ee96f4bfd87c08b83c2849a6b242a5b5881dff4) - Give every diagnostic a code and a link to the page that explains it.

  ```
  [use-everywhere] UE1001: second shared store for "cart" in this tab — …
    → https://rxova.org/packages/use-everywhere/errors/#ue1001
  ```

  The code is the durable part: a message can be reworded, mangled by a minifier
  or truncated by a log aggregator, and `UE1001` survives all three. Codes are
  permanent and never reused — an old build in somebody's browser is still
  emitting them.

  Warnings still cost nothing in production: the call sites keep their
  `process.env.NODE_ENV` guard, and the test that proves it now counts codes
  rather than scanning for a prefix, so a leak names the warning that leaked.

  The message text is otherwise unchanged. Code that matched on it — a test
  asserting a console warning, a log filter — should match on the code instead.

## 0.8.0

### Minor Changes

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`1a3f8d3`](https://github.com/rxova/use-everywhere/commit/1a3f8d3c7081650a75fb0a36c9937aabed742bf0) - Complete the channel: `echo`, `once`, and request/response.

  **`post(type, payload, { echo: true })`** delivers to this client's handlers as well. Not echoing is the `BroadcastChannel` default and usually right, but it was wrong for the case the README kept demonstrating: a component that updates locally _and_ tells everyone else writes the same effect twice, in two places, which then drift. `meta.self` is `true` on the echoed copy, so one handler can serve both.

  **`on(type, handler, { once: true })`** unsubscribes after the first message. The returned unsubscribe stays safe to call afterwards.

  **`ask(type, payload)` / `answer(type, responder)`** — request/response, which is what finally gives `msgId` a job. It was generated on every message and read by nothing: dead wire weight, or an unfinished feature, depending on how charitable you were feeling. A reply carries `replyTo: <the question's msgId>`, so it reaches the client that asked and nobody else — a bystander subscribed to that message type sees the question and not the answer.

  ```ts
  type Requests = { 'config:get': null };
  type Replies = { 'config:get': { theme: string } };
  const channel = createChannel<Requests, Replies>('app');

  channel.answer('config:get', () => ({ theme: currentTheme }));
  const { theme } = await channel.ask('config:get', null);
  ```

  Replies are a second, separate type map, empty by default, so `ask`/`answer` are opt-in and typed rather than `unknown` everywhere. `Channel<M>` keeps working unchanged.

  `ask` **rejects on timeout** (default 5s) rather than hanging — an unanswered question is a fact worth having. If several clients answer, the first reply wins; gate the responder on leadership when it has to be a particular tab. A payload its schema rejects surfaces that error immediately instead of timing out five seconds later on a question that never left.

  Adding `replyTo` is additive within wire v1: a build that predates `ask` neither sets nor reads it, which is exactly the rule for new optional fields.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`8318285`](https://github.com/rxova/use-everywhere/commit/8318285c398904dd6d6bd0237ccb3f71550a85a5) - Add `indexedDbAdapter` — persistence with room, and with real fidelity.

  ```ts
  defineStore('workspace', { persist: indexedDbAdapter('workspace') });
  ```

  Two things it has that `localStorage` does not.

  **Fidelity, with no serializer at all.** IndexedDB stores values with the structured clone algorithm — the same one `BroadcastChannel` uses — so a `Date` comes back a `Date` and a `Map` a `Map`, for free. The whole JSON-degrades-your-types problem the `Serializer` seam exists to solve is simply not present here, and passing a serializer would only reintroduce it. That makes this the right home for state that is not JSON-shaped.

  **Room.** `localStorage` is a few megabytes per origin, shared with everything else on it. IndexedDB is orders of magnitude larger.

  And one thing it does not have: **a synchronous flush.** This is the adapter `store.hydrated` and `useHydrated` were built for — `read` resolves later, so the store is handed back before its state arrives, and a keystroke landing in that window is discarded by last-writer-wins when the restore turns up holding a higher counter. Gate first input on `hydrated`.

  The same asymmetry applies on the way out: a `pagehide` flush cannot be awaited, so the last debounced write before a tab closes may not land. The debounce (`persist.debounceMs`, default 100) is the real protection — keep it short for state you would mind losing, or keep that state in `localStorageAdapter`, which writes synchronously, and the bulk here.

  Failures degrade to a no-op and report through `onError`, like every other adapter: blocked storage, a corrupt record, a quota. An upgrade blocked by another tab holding the database open **rejects rather than hanging** — a promise nothing will settle would leave the store un-hydrated forever, with `hydrated` never resolving, which is worse than a reported failure.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`88fa0a0`](https://github.com/rxova/use-everywhere/commit/88fa0a0e9e892e8954c1591d25a9c2bf06b29896) - Add `createNamespace(name)`, so two independently deployed apps on one origin cannot collide by both taking the defaults.

  A `BroadcastChannel` is global to the origin, so a bus name _is_ an identity. Two micro-frontends that each call `createSharedStore('cart', …)` — or each omit the name and land on `DEFAULT_NAME` — are not two carts. They are one cart, with two teams writing to it, one leader seat contended between them, and one presence roster counting both. Nothing warned, and nothing could: from the library's side that is indistinguishable from the case it exists to serve.

  "Prefix your names" was the workaround, and it fails the way conventions fail — silently, once, in whichever app forgot.

  ```ts
  const checkout = createNamespace('checkout');
  const cart = checkout.createSharedStore('cart', { items: [] }); // bus "checkout:cart"
  ```

  The namespace carries every factory, not a reduced subset, and `busName()` exposes the real bus name for `observeBus`, `getTransportKind` and devtools. An empty namespace throws rather than silently putting everything back on the shared defaults.

  Named `createNamespace` rather than `createScope` — which is what the roadmap and audit both called it — because "scope" was already taken twice: `wire.scope` says _which engine_ a wire belongs to, and the React package's share scope says _how far_ a value travels. Three axes, three words.

  It prevents collision, not access: everything here is same-origin and a namespace is a string, so anything on the page can construct the same one deliberately.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`5c1e1c0`](https://github.com/rxova/use-everywhere/commit/5c1e1c000015cb4b2d68283861609c0491252077) - Validate payloads against a schema instead of casting them and hoping.

  Everything else here is checked before it is trusted — the envelope, the version clock, the origin on a window channel. The payload was the exception: `wire.payload` was cast to the receiving code's type, so what a handler believed it had was whatever the _sender's_ build thought the shape was. A rolling deploy turns that from a technicality into a bug.

  `createChannel` and `createSharedStore` now take a **`schema`** map — per message type, per store key — of anything implementing [Standard Schema](https://standardschema.dev). That is Zod, Valibot, ArkType and anything else exposing `~standard`, without this library depending on any of them: the spec is a shape, not a package. Keys with no entry are not validated, so the seam is adoptable one message at a time.

  Failure differs by direction, on purpose:

  - **Inbound the payload is dropped** — the same choice the envelope makes for a wire it cannot read. The handler is not called and the channel keeps working; one bad payload does not cut a peer off.
  - **Outbound `post()` and `set()` throw** — a value this tab just built and cannot describe is a bug here, and finding it here beats every peer finding it instead. Same all-or-nothing guarantee as the structured-clone pre-check.

  **`onInvalid`** observes failures instead of the default development warning — it replaces the warning, not the outcome.

  Two things worth knowing:

  - In a store, validation sits **after** the last-writer-wins comparison, so a value that was going to lose anyway is neither validated nor reported as broken. It covers the restore from disk as well as the wire, which is the case that matters most: state written by last month's deploy outlives every tab that knew what it meant and restores with a winning clock.
  - **Schemas must be synchronous.** Delivery on this bus is synchronous and documented as such, so a validator that answers later cannot gate a delivery that happens now — the alternatives are buffering every message behind a microtask or letting unvalidated values through while the schema thinks. An async validator is refused with an error naming the vendor rather than quietly awaited. Every synchronous Zod/Valibot/ArkType schema is unaffected.

  New **Validating payloads** guide covers the whole seam.

  Two size budgets move up by ~300 B: `createSharedStore` and `createChannel`, the two engines that gained the gate. That is paid by every caller, including the ones who never declare a schema — the strings are the bulk of it, and they were written terse with the explanation behind a link for exactly that reason.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`f8ec259`](https://github.com/rxova/use-everywhere/commit/f8ec259b395dcf87d83a4894d575962b0ac1e1ad) - Version and migrate persisted state, and make hydration observable.

  Disk is where version skew has its longest fuse. A wire from another deploy is gone in a second; a value written by last month's build sits in storage until someone reopens that tab, and then restores carrying its original version clock — which beats every live tab, in whatever shape the app had a month ago. There was no way to notice, let alone act.

  **`persist.version` + `persist.migrate`.** `version` is the shape of _your_ state, not the `v: 1` envelope the library owns. Default 0, which is also what anything written before this existed reads as, so adopting it works on data already out there.

  - Same version → restored as-is.
  - Older, with `migrate` → migrated, then restored. Migrated values **keep their clocks**, so a restored value re-enters the last-writer-wins order where the original left it. A key the migration _adds_ has no clock on disk, so it gets a fresh one — counter 1, attributed to the tab that ran the migration: a real write that beats an untouched initial and still loses to a live tab holding something newer.
  - Older, no `migrate` → refused.
  - **Newer than this build → refused, always.** A build cannot be asked to understand a shape that postdates it, and guessing would put values it misreads back on the wire with winning clocks. Same call the envelope makes for an unknown wire protocol. This happens for real on every rollback and every old tab reopened after a deploy.

  A refused restore leaves the store on its initial values and reports through **`persist.onRestoreError`** (`'ahead' | 'no-migrate' | 'migrate-threw'`), defaulting to a development warning. A migration that throws is caught and reported with the original error as `cause` — a bug in a migration must not take the store down on every page load.

  **`store.hydrated`** resolves once the restore has landed, been refused, or been found absent; already resolved when there is no persistence. It closes a gap that only async adapters have and that last-writer-wins makes invisible: the store returns on its initial values, a keystroke writes at counter 1, the restore arrives holding counter 5, and the newer keystroke is correctly discarded. Every step is right and the result is a lost keystroke with nothing to point at. It never rejects — a store that kept its initial values is usable, and a promise nobody can await is not.

  Three size budgets move up by ~160-200 B on the entries carrying the store.

  New **Persistence: versions, migrations, hydration** guide.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`627d3c3`](https://github.com/rxova/use-everywhere/commit/627d3c3f5c41300c63cc1d6e56614a62a4170cbf) - Presence carries metadata, and can include this client in its own roster.

  Presence answered "who is here" and nothing about _who they are_. A display name, a tab title, a cursor — the things an avatar strip or a collaborative UI actually needs — had no way to travel.

  `createPresence(name, { metadata })` publishes it; `presence.setMetadata(next)` changes it; every `Peer` carries what that client announced.

  Two decisions that stop it churning:

  - **Metadata rides `hello`, never `ping`.** A ping is a heartbeat and arrives constantly; attaching metadata would re-announce unchanged data forever and rebuild every subscriber's roster on a timer. A ping therefore leaves what is already known in place rather than blanking it.
  - **It compares by value, not reference.** Metadata arrives freshly deserialised every time, so a reference check would call every announcement a change. `setMetadata` with an equal value announces nothing and notifies nobody, which is what makes it safe to call on every render.

  **`includeSelf`** puts this client in its own roster, populated from the first read rather than appearing once somebody else turns up — an avatar list that starts empty and fills in later is a flicker, not a feature. Off by default, because the question a presence strip asks is who _else_ is here.

  Adding `metadata` to the presence wire is additive within v1: a build that predates it neither sets nor reads it.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`4ca1aa4`](https://github.com/rxova/use-everywhere/commit/4ca1aa431124ec3ea3b9016f201a49de4d5dd73f) - Make the two text paths agree with the wire, or say so.

  `BroadcastChannel` carries structured clone; the storage-event transport and disk persistence carry text. JSON is a strictly poorer format — a `Date` comes back a string, a `Map` comes back `{}`, an `undefined` property is simply gone — so the same call had two different answers depending on which transport the browser happened to offer. Persistence had no guard at all.

  **The default serializer now refuses what it would silently change**: `Date`, `Map`, `Set`, `RegExp`, typed arrays, functions, symbols, and `undefined`. The error names the key. That is the same call `store.set()` already makes for a value structured clone rejects — one actionable error beats two replicas that quietly disagree. On the persistence path it reports through `onError` instead of throwing, because persistence is best-effort and must never break the page, but it is no longer silent. `BigInt` and cycles need no code: `JSON.stringify` already throws on both.

  **A `Serializer` seam** carries the rest. Two methods, `stringify` and `parse`, accepted by `webStorageAdapter`/`localStorageAdapter`/`sessionStorageAdapter` and by `StorageTransport`, so wire and disk can be given matching fidelity:

  ```ts
  import * as devalue from 'devalue';

  localStorageAdapter('settings', {
    serializer: { stringify: devalue.stringify, parse: devalue.parse },
  });
  ```

  **Deliberately not a bundled dependency.** Measured brotlied, bundled as a production app would: `@ungap/structured-clone` 1.0 kB, `devalue` 3.4 kB, `superjson` 3.6 kB, `seroval` 7.4 kB — against a whole-library budget of 7.3 kB. Bundling devalue would add 47% to every user for a fidelity most applications do not need, since most state is already JSON-shaped. The seam is the answer, not the dependency, the same call as payload schemas accepting any Standard Schema without depending on Zod.

  New **Serialization** guide, including the measurements.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`0989a2c`](https://github.com/rxova/use-everywhere/commit/0989a2ce24d7f2e894298f55fd99bc22c726c957) - Add `createSharedReducer` — state that converges by replaying actions in one order, not by last-writer-wins on a value.

  This closes the library's most visible correctness wart, and it was the README's own example: two tabs running `set('n', n => n + 1)` at the same moment both read 4, both write 5, and one increment is silently gone. Nothing errors, nothing warns, the number is just too small.

  The cause is _what travels_. Last-writer-wins ships the **result** of the increment, so concurrent results overwrite each other. A reducer ships the **increment**, and two increments are two entries in a list every client replays.

  ```ts
  const votes = createSharedReducer('poll', (n, action) => n + action.by, 0);
  votes.dispatch({ by: 1 });
  ```

  **The leader is the sequencer.** A dispatch is broadcast as a proposal; the leader stamps it with the next number; every client — the leader included — applies commits strictly in that order. That is what makes it correct for _any_ reducer.

  Deliberately **not** an op-log CRDT for commutative operations, which is cheaper and needs no leader. That design converges only if the reducer happens to be commutative, and nothing in a function's type says whether it is. A library whose rule is that silent divergence is the worst failure mode cannot ship a primitive whose correctness depends on a property it cannot check.

  Dispatches apply locally first, so a click never waits on the network, and are reconciled when their commit arrives. A value can therefore be _seen_ out of order for a moment and never _settles_ out of order; `pendingCount()` reports whether this client's view is fully confirmed. The tab holding the seat commits its own dispatches with no round trip at all.

  It reuses an existing `Leader` when handed one, rather than running a second election, and several reducers share a bus by `key` the way store keys do.

  Ordering rides a new `op` wire scope. Adding a scope is additive within wire v1 — every existing engine already ignores scopes it does not recognise — so a tab on an older build is unaffected rather than confused.

  **What it is not.** Leadership is advisory: in the window where two tabs both believe they hold the seat, two commits can carry the same number. The second is dropped and the client re-syncs from a snapshot, so the outcome is a correction rather than a divergence — but anything that must happen exactly once still needs a server-side idempotency key. This is the ceiling for this library; past it, reach for a real CRDT.

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`c181625`](https://github.com/rxova/use-everywhere/commit/c1816257a729687143a4f54f86471efd1f8ea1e5) - Stop the late-joiner snapshot storm, and add `store.transaction()`.

  **Joining cost scaled with how many people were already there.** Every peer answered every `hello` with a full snapshot, so opening one tab in a room of twenty put twenty complete copies of the state on the wire — each of which the joiner then applied, and each of which a peer paid to serialise.

  A peer now answers after a short jittered pause and only if nobody else already did. One reply, whoever is quickest, no election and no leader: a room where every peer can equally well answer should not need a seat to decide who does. Because a snapshot is a broadcast, that single reply also serves every joiner waiting at the same moment.

  Two rules keep the suppression honest, and the second was a bug found by its own test:

  - A client with nothing **written** does not answer at all. Registered initials are not data, and answering with them would only crowd out a peer that has something real.
  - A pending reply stands down only for a snapshot that says everything it would have. Cancelling on _any_ snapshot looked right and was not: a joiner that has nothing yet also answers `hello`s, and its empty snapshot would silence the peer holding the actual state — leaving everybody empty, and nobody wrong, until the next write.

  Tune with `snapshotDelayMs` (default 40). The cost is that hydrating a late joiner now takes up to that long instead of a round trip.

  **Applying a snapshot was O(K²).** The snapshot object was rebuilt per key — `{...state}` and `{...versions}`, both O(K) — so a K-key snapshot cost K rebuilds, once per peer that sent one. Snapshots now apply as a batch: one rebuild, O(K).

  That also fixes something subtler. A subscriber called mid-loop used to observe a _half-applied_ snapshot, a state no tab ever intended and which was visible only from inside the loop applying it. Every listener now sees the settled state.

  **`store.transaction(fn)`** exposes the same batching: several writes, one rebuild, subscribers that never see a partial group.

  ```ts
  store.transaction(() => {
    store.set('firstName', 'Ada');
    store.set('lastName', 'Lovelace');
  });
  ```

  Local batching, **not** a distributed transaction — each write is still its own patch, so a peer may see them arrive separately. Making them atomic across tabs would need a wire type older builds silently ignore, which is a worse problem than the one being solved. Transactions nest, only the outermost flushes, and a throwing `fn` still delivers the writes that landed, because those are already on the wire.

- [#52](https://github.com/rxova/use-everywhere/pull/52) [`21a4c33`](https://github.com/rxova/use-everywhere/commit/21a4c33266bceef06b8577d0b59ae2083141f94a) - Make version skew a fact you can see rather than one you have to deduce.

  Every deploy puts two versions of your app on one origin for as long as it takes users to reload, both on the same bus. Wires from another protocol version were already dropped safely at the envelope — but dropped is all they were, which is indistinguishable from the peer having nothing to say. A tab could spend an afternoon sharing state with half the origin and never find out.

  - **`getWireSkew(name)`** returns the foreign wire protocol versions heard on a bus, ascending. Empty is the normal case; non-empty means this page is partitioned from those peers by design, and is what a "reload for the latest version" banner should be gated on. Page-wide, so two library copies that are themselves partitioned still see the same answer — skew is a property of the origin, not of one bundle's view of it. Cumulative, so a stale tab closing does not un-report the deploy that produced it.
  - Development gets a warning naming the bus, both versions, and which direction the other build is.
  - **`WIRE_VERSION`** is exported for logging and assertions.

  Recognising a skewed peer is deliberately strict — full envelope shape, numeric `v`, string `scope`/`type`/`clientId`. A bus name is only a `BroadcastChannel` name, and reporting an unrelated script on the origin as a stale deploy would make the signal worthless.

  Also fixes the store's wire dispatch, which ended in a bare `else`: every `state` wire that was not a `hello` or a `patch` was read as a snapshot. Adding any new `state` type in a later minor would therefore have arrived at every older tab as a malformed snapshot, and the only reason that was harmless today is that the versions-map check happened to reject it. Unknown types are now ignored explicitly, which is what makes additive evolution within a protocol version safe by design rather than by luck.

  The contract both halves come from — what may be added within a version, what must bump it — is documented at `packages/core/src/wire.ts` and in the new **Version skew & the wire contract** docs page.

  Three size budgets move up by ~150-200 B: `createSharedStore`, `createChannel` and `createPresence`, the entries that carry the bus and therefore the skew check. Most of that is the development warning string, which survives into production bundles until dev-only stripping lands — the warning was rewritten terse with the explanation behind a link for exactly that reason, and this is what it costs after that.

### Patch Changes

- [#56](https://github.com/rxova/use-everywhere/pull/56) [`2eaf24a`](https://github.com/rxova/use-everywhere/commit/2eaf24abc2e5f5b1ffe1948dae9736f95c1f00bd) - Keep development warnings out of production bundles.

  Every warning string was shipping to every user. `devWarn` checked `NODE_ENV` at runtime, so the _call_ was inert in production — but the message was built at the call site, so the string itself was in the bundle regardless. Four consecutive features paid 150–300 B each for this before the pattern was named, and the pressure ran the wrong way: every new warning was an argument for writing a terser warning.

  Each call site now carries the guard literally:

  ```ts
  if (process.env.NODE_ENV !== 'production') {
    devWarn(`[use-everywhere] …`);
  }
  ```

  Written out rather than hidden behind a shared constant, because a bundler can only fold what it can see. It replaces `process.env.NODE_ENV` with `"production"`, the branch becomes statically false, and the string goes with it. In React's `useSharedState` the guard wraps the whole `warnOnInitialMismatch` call, so the bundler drops the function, its Map of seen initials, and its message together.

  Measured on the real entry point, bundled the way a production app bundles it: **594 B brotlied**, 12 of 12 warnings gone. Two messages deliberately stay — a thrown `Error` a caller can catch, and the report of a throwing debug observer, which is a real fault being contained rather than a diagnostic.

  Every size budget is retightened to the new measurement. Most are now **lower than before this stack started**, despite three features having landed on it.

  `dev-stripping.test.ts` pins the guarantee: it bundles `src/index.ts` twice, once as development and once as production, and fails naming any warning that survives. A budget can notice that a bundle grew; it cannot say why, which is how this went unnoticed for four releases. A companion runtime test covers the production arm of each guard — Vitest runs with `NODE_ENV=test`, so without stubbing, the arm every real user takes is never executed.

  **One trade worth knowing.** A browser loading this ESM directly, with no bundler to define `process`, now throws a `ReferenceError`. Prefixing `typeof process !== 'undefined'` would prevent that, but esbuild does not fold it away — measured, not assumed — which would leave a dead branch in every production bundle and an untestable one in coverage. Bundle the package, or shim `process.env.NODE_ENV`.

## 0.7.0

### Minor Changes

- [#44](https://github.com/rxova/use-everywhere/pull/44) [`2b20291`](https://github.com/rxova/use-everywhere/commit/2b20291720c861f865abb50d5f853309d41399f7) - Fall back instead of silently doing nothing when `BroadcastChannel` is missing.

  `defaultTransport` used to hand back a `NoopTransport` in that case: every hook kept working, every write appeared to succeed, and nothing was ever shared with anybody. That is the worst failure this library can have, because it is indistinguishable from success.

  The chain is now `BroadcastChannelTransport` → `StorageTransport` → `NoopTransport`, and every step down warns in development.

  - **`StorageTransport`** rides a quirk of `localStorage`: writing fires a `storage` event in every _other_ same-origin tab and never in the writer — exactly the no-self-echo semantics the engines need. The entry is removed immediately after writing, so application state never lingers on disk. Fidelity is JSON rather than structured clone (a `Date` arrives as a string, a `Map` as `{}`), and values JSON cannot represent — functions, symbols — are **rejected rather than silently dropped**, preserving the all-or-nothing write guarantee.
  - **`getTransportKind(name)`** answers "is anything even connected?" — `'broadcast-channel' | 'storage' | 'none' | 'custom'`, or `null` when no bus exists for that name. A plain function, not a hook: a bus picks its transport once and keeps it for the life of the page.
  - **`isStorageEventAvailable()`** joins `isBroadcastChannelAvailable()`. It probes with a real write, because Safari's old private mode exposed a `localStorage` object that threw on every `setItem`.
  - `Transport` gains an optional `kind`; the shipped transports declare theirs, and a custom one without it reports as `'custom'`.

  Also: a presence engine attached to a bus that already existed now announces itself immediately rather than showing an empty roster until the next heartbeat.

- [#42](https://github.com/rxova/use-everywhere/pull/42) [`d28b81f`](https://github.com/rxova/use-everywhere/commit/d28b81fa407d5918ecf6378b5937b39bd26824e9) - Elect the leader with the Web Locks API where it exists.

  The heartbeat election has to infer that a leader is gone from silence, which is why it needs a lease — and why a backgrounded tab whose timers are clamped can be deposed while perfectly healthy, running the teardown in `useLeaderEffect` for no reason. With `navigator.locks` the browser owns the queue instead: failover on a crash is immediate rather than lease-length, holding the seat depends on no timer at all, and there is no periodic announce traffic.

  `strategy` defaults to `'auto'` — Web Locks when available, heartbeat otherwise. Web Locks is a **secure-context** API, so a plain-`http://` origin (an intranet app, a LAN staging box) keeps the heartbeat election; that fallback is load-bearing, not legacy. Pass `strategy: 'heartbeat'` to force it, or `strategy: 'web-locks'` to fail loudly rather than degrade silently. `leader.strategy` reports which one is in use.

  Also adds `waitForLeadership()`, which resolves when this client holds the seat (immediately if it already does) and rejects if the leader is closed while waiting, so an `await` in a tab being torn down cannot hang.

  One behavioural difference worth knowing: on the Web Locks strategy a lone eligible tab that calls `resign()` is handed the seat straight back, because re-queuing finds nobody else waiting. `resign()` moves the seat when there is somewhere for it to move.

- [#47](https://github.com/rxova/use-everywhere/pull/47) [`faa3aad`](https://github.com/rxova/use-everywhere/commit/faa3aadd0f0e787a557ee002f21ef3b62283fc8c) - Make several copies of the library on one page behave as one client.

  A module-scoped registry is per _bundle_, not per page. Two micro-frontends that each bundled their own copy therefore each built their own bus, their own clientId, and their own presence entry — so one page appeared to its peers as two tabs, contended with itself for the leader seat, and could not share state within itself at all, because a post goes to the transport and no transport loops back to the context that made it.

  Copies now find each other through a rendezvous point on `globalThis`, keyed by a versioned symbol, and share one bus per name: one identity, one presence entry, one leader seat. `getBus` returns a handle per call rather than the bus itself, so siblings release independently and the bus shuts down only when the last one lets go.

  State and event wires are additionally delivered **synchronously** to sibling handles on the same page — the difference between two micro-frontends sharing a store and merely converging on it after a round trip. Presence and leader wires are not, because those are properties of a client and a page is one client.

  Copies compiled against different rendezvous protocols cannot share live objects, so they partition — back to one client each, exactly as before this existed — and say so in development instead of leaving it to be discovered.

  This also fixes two shared stores on one name in one page, which previously could never hear each other. The development warning for that case remains, because paying twice for one store's state, subscriptions, and persistence writes is still usually a mistake, but it no longer claims they will diverge.

- [#45](https://github.com/rxova/use-everywhere/pull/45) [`358e9b5`](https://github.com/rxova/use-everywhere/commit/358e9b5eae2b0a0e120ab44b8e67ab4c52b00673) - Probe peers before pruning them, so a throttled tab is not mistaken for a dead one

  Browsers clamp a hidden tab's timers to roughly one tick a minute, so a healthy
  backgrounded peer stops heartbeating on schedule. Pruning on silence alone made
  the roster oscillate once a minute for a tab that never went anywhere.

  Message handlers are not throttled, only timers are — so a peer that goes quiet
  is now sent a `hello` and only removed if it stays silent through a further
  `probeGraceMs` (new option, default 1000ms). A peer that answers in time is never
  removed, so subscribers see no membership change rather than a drop and re-add.
  Buses also re-announce on `visibilitychange`, which re-registers a returning tab
  within a round trip instead of a heartbeat — the case that matters after a
  laptop wakes and every tab is throttled at once.

### Patch Changes

- [#40](https://github.com/rxova/use-everywhere/pull/40) [`a0cee27`](https://github.com/rxova/use-everywhere/commit/a0cee27dbc2f760af80410ed5c67c9d1c50ff42d) - Validate wires before trusting their shape. A peer posting a `patch` or leader `claim` whose `version`/`term` was not a version clock — a different deploy of your app mid-rollout, or any buggy script on the origin — reached `newer()` and threw a `TypeError` inside the receiving tab's message handler, where nothing catches it.

  The envelope check now also requires `scope`, `type`, and `clientId` to be strings, and malformed version clocks are dropped rather than applied. Found by the new property-based suite, which fuzzes arbitrary wires at a live store.

- [#46](https://github.com/rxova/use-everywhere/pull/46) [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b) - Raise every size budget to roughly 20% above its current measurement. The budgets had been tracking actual size so closely that unrelated work kept tripping them — five moves across M1 and M2 — and each one cost a review cycle that had nothing to do with the change under review. Entries that already had more than 20% of slack keep their existing limit rather than being tightened.

  This is deliberately headroom, not permission: the budgets still fail on a real regression, and the underlying cause of the drift — development-only warning strings surviving into production bundles — is unchanged and still scheduled.

- [#46](https://github.com/rxova/use-everywhere/pull/46) [`be5d008`](https://github.com/rxova/use-everywhere/commit/be5d00883c69800f6f5c2f019eb1dec4a2d2bb5b) - Give `StorageTransport` a useful error where there is no `localStorage`.

  The default parameter referenced the bare global, so constructing one in a worker threw `ReferenceError: localStorage is not defined` — accurate and useless. `defaultTransport` never reaches that path because it probes first, but the class is exported, so a direct caller now gets told that workers have neither `localStorage` nor the storage event, and to use `BroadcastChannel` there.

## 0.6.0

### Minor Changes

- [#38](https://github.com/rxova/use-everywhere/pull/38) [`7e2e2e6`](https://github.com/rxova/use-everywhere/commit/7e2e2e61e19caa2fbc3691c4470f36a92e9684f2) - Move `MemoryHub` and `MemoryTransport` to a `testing` subpath.

  ```diff
  -import { MemoryHub } from '@use-everywhere/core';
  +import { MemoryHub } from '@use-everywhere/core/testing';
  ```

  They are a multi-tab simulation harness, not runtime API. On the package root they were part of the public, semver-bound surface — something 1.0 would have to promise not to break — and sat in every production bundle's module graph. Nothing else moved: `BroadcastChannelTransport`, `NoopTransport`, and `defaultTransport` are real transports and stay on the root.

## 0.5.0

### Minor Changes

- [#35](https://github.com/rxova/use-everywhere/pull/35) [`5daf920`](https://github.com/rxova/use-everywhere/commit/5daf9205a9a18a03af588ffb021bc08c13bfecd5) - Harden the core against the failure modes real tabs hit:

  - **bfcache**: a tab restored from the back/forward cache now re-announces presence, re-runs the store's late-joiner handshake, and rejoins the leader election — previously it held silently stale state and a phantom seat until the next unrelated write.
  - **All-or-nothing writes**: a value that cannot survive structured clone (a function, DOM node, or class instance smuggled into an object) now throws a `TypeError` naming the key _before_ touching local state — previously the local replica updated, the broadcast threw, and the tab silently diverged from every peer.
  - **Crypto-grade ids**: client ids and window-channel nonces now come from Web Crypto (64-bit hex) instead of `Math.random().toString(36).slice(2, 8)`. The clientId is the LWW tie-breaker and the self-echo filter, and the nonce is a security boundary — a collision meant permanent silent divergence or mutual invisibility.
  - **Idempotent `close()`** on every engine, and a shutdown guard on the shared bus: a double-closed channel can no longer shut the bus down underneath a sibling store.
  - **Window channel**: a handshake timeout now tears the message listener down, so a child that connects late cannot revive a channel whose promises already rejected; the child side now validates `event.source` against the opener, mirroring the opener's own defense.
  - **Persistence observability**: `webStorageAdapter` / `localStorageAdapter` / `sessionStorageAdapter` accept an `onError(error, operation)` callback — quota, blocked storage, and corrupt entries stay best-effort no-ops, but are no longer invisible.
  - **Dev diagnostics**: development-only warnings for conflicting bus options (first creator wins) and for a second store on one name in one tab (they can never sync).
  - **Dev-freeze fixes**: typed arrays no longer crash dev builds (freezing a non-empty view throws in every engine); Map/Set contents are now frozen; lazily registered initial values pass through the same guard as every other entry path.
  - **Observer isolation**: a throwing `observeBus` observer is contained and reported instead of breaking the bus it watches.
  - **Test-transport fidelity**: `MemoryHub` now structured-clones every delivery like the real BroadcastChannel — reference-identity payloads and non-cloneable values no longer pass in tests only to fail in production.

  Size budgets were raised to absorb the new lifecycle and safety machinery (the whole-surface budget goes 4.5 kB to 5 kB brotlied).

### Patch Changes

- [#37](https://github.com/rxova/use-everywhere/pull/37) [`0044801`](https://github.com/rxova/use-everywhere/commit/0044801e6f38f09483215a3c9248032c3b857f00) - Drop a key's listener bucket when its last subscriber unsubscribes. Per-item keys (`useSharedState(\`row-${id}\`, …)`) previously left one empty `Set` behind for every key that ever mounted, for the life of the page.

## 0.4.1

### Patch Changes

- [#31](https://github.com/rxova/use-everywhere/pull/31) [`b96b6e9`](https://github.com/rxova/use-everywhere/commit/b96b6e90230fb5363a0c5e732b5db238e06c3391) - Add the project logo as `assets/logo.svg` and show it above the title in the README. Documentation-only: no API, bundle, or runtime change.

## 0.4.0

### Minor Changes

- 833d69a: Ship a CommonJS build alongside ESM so `require('@use-everywhere/core')` resolves in Jest and other CJS toolchains, not just `import`. The `exports` map now serves per-condition types (`.d.ts`/`.d.cts`) and is clean under are-the-types-wrong across node10, node16 (CJS + ESM), and bundler.

  Also deep-freeze shared values in development: a store's `state` proxy is shallow, so an accidental in-place mutation (`store.state.list.push(x)`, or mutating a value you read) bumps no version clock and silently fails to sync. In dev that now throws a `TypeError` at the offending line; production strips the freeze entirely, so it costs nothing shipped.

## 0.3.0

### Minor Changes

- ad7f986: Add a debug seam: observeBus(name, fn) reports every wire crossing a bus in both directions, enableDebug() logs them to the console, and getBusNames() lists the live buses. Outbound wires are the point — a post goes straight to the transport, so until now nothing a client said was observable from inside it. Also exports DEFAULT_NAME and the BusWire/BusEvent types.
- 1ce8824: Add createLeader(name, options): opt-in leader election so exactly one tab owns the socket, the polling loop, or the token refresh. Lease-and-claim with a sticky incumbent — a new tab adopts the current leader instead of stealing the seat, a closing tab hands it over immediately, and a crashed one is replaced after the lease. Terms reuse the same newer() clock as the store, so crossing claims resolve deterministically. Leadership is advisory, not a distributed lock.
- 0bf735a: Add opt-in persistence. createSharedStore accepts a persist option; localStorageAdapter, sessionStorageAdapter, and webStorageAdapter store the state together with its version clocks, so a reopened tab re-enters the last-writer-wins race with its real term rather than a fresh zero. A restored value beats a staler live tab and loses to a newer one, and either way all tabs converge. Blocked storage, corrupt JSON, and a full quota degrade to a silent no-op. Stores also expose getVersions().
