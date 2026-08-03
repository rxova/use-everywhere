import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientId, newMsgId } from '../ids.js';

// The clientId is the LWW tie-breaker and the self-echo filter, and newMsgId
// mints the window channel's security nonce — entropy is load-bearing here.
describe('ids', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mints lowercase-hex ids from Web Crypto: 64 bits for clients, 128 for messages', () => {
    // The extra width on newMsgId is deliberate — it also mints the window
    // channel's cross-origin `cid` nonce.
    expect(newClientId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newMsgId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('never collides across a burst of mints', () => {
    const minted = new Set(Array.from({ length: 1000 }, () => newClientId()));
    expect(minted.size).toBe(1000);
  });

  it('falls back to Math.random ids of the same shape when Web Crypto is absent, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('crypto', undefined);

    const id = newClientId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(newMsgId()).toMatch(/^[0-9a-f]{32}$/);
    expect(newClientId()).not.toBe(id);

    // Silent degradation of a security property is the thing being prevented.
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('getRandomValues');
  });
});
