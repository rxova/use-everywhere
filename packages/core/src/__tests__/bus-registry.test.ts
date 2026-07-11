import { describe, expect, it, vi } from 'vitest';
import { createChannel } from '../channel.js';
import { createPresence } from '../presence.js';
import { defaultTransport, isBroadcastChannelAvailable } from '../transport/default-transport.js';
import { NoopTransport } from '../transport/noop-transport.js';

describe('bus registry (default transport)', () => {
  it('engines with the same name share one bus and one client identity', () => {
    const channel = createChannel('reg-shared');
    const presence = createPresence('reg-shared');

    expect(presence.clientId).toBe(channel.clientId);

    channel.close();
    presence.close();
  });

  it('recreates the bus after every ref released it', () => {
    const first = createChannel('reg-lifecycle');
    const firstId = first.clientId;
    first.close();

    const second = createChannel('reg-lifecycle');
    expect(second.clientId).not.toBe(firstId);
    second.close();
  });
});

describe('defaultTransport without BroadcastChannel (SSR)', () => {
  it('falls back to NoopTransport when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    try {
      expect(isBroadcastChannelAvailable()).toBe(false);
      expect(defaultTransport('ssr')).toBeInstanceOf(NoopTransport);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('NoopTransport', () => {
  it('accepts posts, subscriptions, and close without ever delivering', () => {
    const transport = new NoopTransport();
    const delivered = 0;
    const unsubscribe = transport.subscribe();

    transport.post();
    unsubscribe();
    transport.close();

    expect(delivered).toBe(0);
  });
});
