import { describe, expect, it } from 'vitest';
import { getBusNames } from '../bus.js';
import { createChannel } from '../channel.js';
import { createLeader } from '../leader.js';
import { createPresence } from '../presence.js';
import { MemoryHub } from '../transport/memory-hub.js';

// Every engine on a shared bus decrements one refcount in close(). A double
// close used to decrement twice — shutting down the transport underneath a
// sibling engine that was still using it. close() is idempotent now.
describe('close() is idempotent', () => {
  it('for channels', () => {
    const hub = new MemoryHub();
    const channel = createChannel('ci-channel', { transport: () => hub.connect() });
    channel.close();
    expect(() => channel.close()).not.toThrow();
  });

  it('for presence', () => {
    const hub = new MemoryHub();
    const presence = createPresence('ci-presence', { transport: () => hub.connect() });
    presence.close();
    expect(() => presence.close()).not.toThrow();
  });

  it('for leaders', () => {
    const hub = new MemoryHub();
    const leader = createLeader('ci-leader', { transport: () => hub.connect() });
    leader.close();
    expect(() => leader.close()).not.toThrow();
  });

  it('a double-closed engine no longer takes the shared bus down with it', () => {
    // Two engines, one registry bus (refs = 2). A channel closed twice used to
    // decrement both refs and shut the bus down underneath the presence engine.
    const channel = createChannel('ci-shared');
    const presence = createPresence('ci-shared');

    channel.close();
    channel.close();

    expect(getBusNames()).toContain('ci-shared'); // presence still holds its ref
    presence.close();
    expect(getBusNames()).not.toContain('ci-shared');
  });
});
