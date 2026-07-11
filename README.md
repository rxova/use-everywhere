# use-everywhere

State and messages that exist in every tab, window, and worker — with a React API.

Two transports behind one library:

- **BroadcastChannel** (same-origin): shared state with last-writer-wins version
  clocks and a late-joiner handshake, typed pub/sub events, and peer presence.
- **window.opener / postMessage** (cross-origin): a secure 1:1 channel to a
  window you opened — e.g. a payment page on another domain that must report
  back to the checkout that opened it.

## Packages

- `packages/core` — `@use-everywhere/core`, framework-agnostic engine
- `packages/react` — `use-everywhere`, React hooks (re-exports core)
- `apps/demo` — Vite demo app, including a cross-origin payment flow

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm dev        # demo at http://localhost:5173
```

The original single-file prototypes live in `prototypes/` (open directly in a
browser, no build needed).
