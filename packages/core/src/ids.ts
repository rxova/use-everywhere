import { devWarn } from './dev.js';

// Ids are load-bearing beyond uniqueness: the clientId is the LWW tie-breaker
// (two equal ids deadlock a version tie forever) and the self-echo filter (a
// collision makes two tabs mutually invisible), and newMsgId mints the window
// channel's per-connection nonce — a security boundary.
//
// getRandomValues, deliberately, not randomUUID: randomUUID is restricted to
// secure contexts, so it is undefined on a plain-http origin (an intranet app,
// a LAN staging box) — exactly the same-origin multi-tab setups this library
// exists for. getRandomValues carries no such restriction and has shipped in
// every browser for over a decade, plus workers, Node, Deno and Bun.
function randomHex(bytes: number): string {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    let out = '';
    for (const b of buf) out += b.toString(16).padStart(2, '0');
    return out;
  }
  // Practically unreachable on the web; kept so an exotic host (Hermes without
  // a polyfill) degrades instead of throwing on import. Warned about rather
  // than silent: this weakens the window channel's nonce, and a security
  // property that quietly downgrades is worse than one that fails loudly.
  if (process.env.NODE_ENV !== 'production') {
    devWarn(
      'UE1006',
      'crypto.getRandomValues is unavailable; falling back to Math.random for ids. Cross-origin window nonces are not cryptographically strong in this environment.',
    );
  }
  let out = '';
  while (out.length < bytes * 2)
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  return out;
}

/** 64 bits: the collision domain is the tabs live on one origin, plus the clientIds baked into its persisted version clocks. */
export function newClientId(): string {
  return randomHex(8);
}

/** 128 bits: this also mints the window channel's `cid`, which gates message acceptance across origins. */
export function newMsgId(): string {
  return randomHex(16);
}
