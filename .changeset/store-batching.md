---
'@use-everywhere/core': minor
---

Stop the late-joiner snapshot storm, and add `store.transaction()`.

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
