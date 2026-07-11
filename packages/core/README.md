# @use-everywhere/core

Framework-agnostic engine for cross-tab shared state, typed events, peer
presence, and secure cross-origin window channels.

```bash
npm i @use-everywhere/core
```

> Using React? Install [`use-everywhere`](https://www.npmjs.com/package/use-everywhere)
> instead — it provides hooks and re-exports this entire package.

Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins version
  clocks and a late-joiner handshake, typed pub/sub events, and peer presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened. Every message is validated by origin, envelope brand, a
  per-connection nonce, and the source window.

## Design notes

- **Shared state never crosses origins.** Two origins are two trust domains;
  the cross-origin channel is explicit, per-message, and typed.
- Same-origin state sync uses per-key `[counter, clientId]` clocks
  (last-writer-wins, deterministic tie-break) and a hello/snapshot handshake so
  late-joining tabs hydrate instantly.
- Values must survive structured clone (no functions, DOM nodes, etc.).

Full docs, demo app (including a real cross-origin payment flow), and source:
[github.com/rxova/use-everywhere](https://github.com/rxova/use-everywhere)

## License

MIT
