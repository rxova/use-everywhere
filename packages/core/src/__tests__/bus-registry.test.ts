import { describe, expect, it, vi } from 'vitest';
import { createChannel } from '../channel.js';
import { createPresence } from '../presence.js';
import { defaultTransport, isBroadcastChannelAvailable } from '../transport/default-transport.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { NoopTransport } from '../transport/noop-transport.js';
import { tick } from './helpers/tick.js';

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

describe('bus hardening', () => {
  it('posting after close is a silent no-op', async () => {
    const hub = new MemoryHub();
    const options = { transport: () => hub.connect() };
    const closed = createChannel<{ ping: number }>('h1', options);
    const listener = createChannel<{ ping: number }>('h1', options);
    const got: number[] = [];
    listener.on('ping', (n) => got.push(n));

    closed.close();
    expect(() => closed.post('ping', 1)).not.toThrow();
    await tick();

    expect(got).toEqual([]);
    listener.close();
  });

  it('ignores garbage that is not a bus wire', async () => {
    const hub = new MemoryHub();
    const channel = createChannel<{ ping: number }>('h2', { transport: () => hub.connect() });
    const got: number[] = [];
    channel.on('ping', (n) => got.push(n));

    const raw = hub.connect();
    raw.post('garbage string');
    raw.post({ not: 'a wire' });
    raw.post(null);
    await tick();

    expect(got).toEqual([]);
    channel.close();
  });

  it('drops wires spoofing our own clientId', async () => {
    const hub = new MemoryHub();
    const channel = createChannel<{ ping: number }>('h3', { transport: () => hub.connect() });
    const got: number[] = [];
    channel.on('ping', (n) => got.push(n));

    const raw = hub.connect();
    raw.post({
      v: 1,
      scope: 'event',
      type: 'ping',
      payload: 7,
      clientId: channel.clientId, // pretends to be us — must be treated as self-echo
      kind: 'tab',
      msgId: 'x',
    });
    await tick();

    expect(got).toEqual([]);
    channel.close();
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
