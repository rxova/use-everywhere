---
'use-everywhere': minor
---

Add `usePresenceMetadata`, and `usePeers({ includeSelf })`.

```tsx
usePresenceMetadata({ name: user.name, editing: currentDocId });

const everyone = usePeers({ includeSelf: true });
```

Each peer now carries whatever it published about itself as `metadata`, which is what an avatar strip or a "who is editing this" indicator needs and had no way to get.

Safe to call with a fresh object every render — the value is compared by contents, so an unchanged one announces nothing and re-renders nobody. Publishing happens in an effect rather than during render, because announcing is a side effect _on every other tab_, and a render React throws away must not be one other tabs already saw.

`includeSelf` is part of the presence instance key rather than a per-call option: it changes what the roster _is_, and two components on one name disagreeing about it would otherwise silently get whichever answer was built first.

Namespaces carry both, and the server double gained the matching no-op.
