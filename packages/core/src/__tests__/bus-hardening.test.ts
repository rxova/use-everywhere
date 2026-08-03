import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '../bus.js';

// These run against the shared registry (no custom transport), because the
// hazards under test — conflicting options, double release — only exist when
// callers share one bus. Node >= 18 provides a real BroadcastChannel.
describe('getBus hardening', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns when a later caller asks for a different heartbeatMs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = getBus('bh-heartbeat', { heartbeatMs: 2000 });
    const second = getBus('bh-heartbeat', { heartbeatMs: 50 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('heartbeatMs');

    first.release();
    second.release();
  });

  it('warns when a later caller asks for a different kind', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = getBus('bh-kind'); // node has no document, so this announces as 'worker'
    const second = getBus('bh-kind', { kind: 'tab' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('kind');

    first.release();
    second.release();
  });

  it('does not warn when later callers match the bus or pass nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = getBus('bh-match', { heartbeatMs: 3000 });
    const second = getBus('bh-match', { heartbeatMs: 3000, kind: first.kind });
    const third = getBus('bh-match');

    expect(warn).not.toHaveBeenCalled();

    first.release();
    second.release();
    third.release();
  });

  it('release after shutdown is a no-op, and the name is reusable afterwards', () => {
    const bus = getBus('bh-release');
    bus.release(); // refs 0: shutdown
    expect(() => bus.release()).not.toThrow(); // extra release cannot go negative

    // A fresh bus under the same name works — the stray release did not
    // poison the registry slot.
    const again = getBus('bh-release');
    expect(again.clientId).not.toBe(bus.clientId);
    expect(() =>
      again.post({
        v: 1,
        scope: 'presence',
        type: 'ping',
        clientId: again.clientId,
        kind: again.kind,
      }),
    ).not.toThrow();
    again.release();
  });
});
