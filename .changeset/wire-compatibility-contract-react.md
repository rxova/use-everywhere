---
'use-everywhere': minor
---

Re-export `getWireSkew` and `WIRE_VERSION` from core.

A React app installs one package, so anything core adds that an application would reach for has to be enumerated here too. `getWireSkew(name)` is how a running app finds out that another generation of its own bundle is open in a neighbouring tab — the case a rolling deploy creates every time — and gating a "reload for the latest version" banner on it is the reason it exists.

Two size budgets move up by ~150 B: `useChannel + useMessage + useSend` and `usePeers + useClientId`, the two smallest entries, which carry the bus and therefore the skew check. Most of that is the development warning string, which survives into production bundles until dev-only stripping lands — the warning was written terse with the explanation behind a link for exactly that reason, and this is what it costs after that.
