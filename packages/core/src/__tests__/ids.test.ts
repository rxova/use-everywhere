import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientId, newMsgId } from '../ids.js';

// The clientId is the LWW tie-breaker and the self-echo filter, and newMsgId
// mints the window channel's security nonce — entropy is load-bearing here.
describe('ids', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mints 64-bit lowercase-hex ids from Web Crypto', () => {
    const id = newClientId();
    const msg = newMsgId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(msg).toMatch(/^[0-9a-f]{16}$/);
  });

  it('never collides across a burst of mints', () => {
    const minted = new Set(Array.from({ length: 1000 }, () => newClientId()));
    expect(minted.size).toBe(1000);
  });

  it('falls back to Math.random ids of the same shape when Web Crypto is absent', () => {
    vi.stubGlobal('crypto', undefined);
    const id = newClientId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(newMsgId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newClientId()).not.toBe(id);
  });
});
