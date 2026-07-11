// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createSharedStore } from '../shared-store.js';
import { BroadcastChannelTransport } from '../transport/broadcast-channel-transport.js';
import { defaultTransport, isBroadcastChannelAvailable } from '../transport/default-transport.js';
import { tick } from './helpers/tick.js';

describe('BroadcastChannelTransport (happy-dom)', () => {
  it('is available in this environment and picked by defaultTransport', () => {
    expect(isBroadcastChannelAvailable()).toBe(true);
    const transport = defaultTransport('bc-default');
    expect(transport).toBeInstanceOf(BroadcastChannelTransport);
    transport.close();
  });

  it('delivers between two transports on the same channel name', async () => {
    const a = new BroadcastChannelTransport('bc-int');
    const b = new BroadcastChannelTransport('bc-int');
    const got: unknown[] = [];
    b.subscribe((d) => got.push(d));

    a.post({ hello: true });
    await tick();

    expect(got).toEqual([{ hello: true }]);
    a.close();
    b.close();
  });

  it('syncs two shared stores over a real BroadcastChannel', async () => {
    // Explicit transport factories make two isolated clients in one page.
    const factory = (name: string) => new BroadcastChannelTransport(name);
    const a = createSharedStore('bc-store', { count: 0 }, { transport: factory });
    const b = createSharedStore('bc-store', { count: 0 }, { transport: factory });
    await tick();

    a.set('count', 9);
    await tick();

    expect(b.getSnapshot().count).toBe(9);
    a.close();
    b.close();
  });
});
