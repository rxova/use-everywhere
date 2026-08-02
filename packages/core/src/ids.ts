// Ids are load-bearing beyond uniqueness: the clientId is the LWW tie-breaker
// (two equal ids deadlock a version tie forever) and the self-echo filter (a
// collision makes two tabs mutually invisible), and newMsgId mints the window
// channel's per-connection nonce — a security boundary. Web Crypto is used
// wherever it exists; Math.random survives only as a last resort for exotic
// hosts without `crypto`.
function randomHex(bytes: number): string {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    let out = '';
    for (const b of buf) out += b.toString(16).padStart(2, '0');
    return out;
  }
  let out = '';
  while (out.length < bytes * 2)
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  return out;
}

export function newClientId(): string {
  return randomHex(8);
}

export function newMsgId(): string {
  return randomHex(8);
}
