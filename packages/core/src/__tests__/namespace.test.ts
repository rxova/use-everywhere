import { describe, expect, it } from 'vitest';
import { DEFAULT_NAME } from '../defaults.js';
import { createNamespace } from '../namespace.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

/**
 * The collision this prevents is the quiet one. A BroadcastChannel is global to
 * the origin, so a name *is* an identity — two micro-frontends that each call
 * `createSharedStore('cart', …)` are not two carts, they are one cart with two
 * teams writing to it. Nothing warns, because from the library's side that is
 * indistinguishable from the intended case of two tabs sharing state.
 */

/**
 * A hub per bus name, because that is what the real transport is: a
 * `BroadcastChannel` is keyed by its name, and a single shared `MemoryHub`
 * would deliver across namespaces no matter what the library did — proving
 * nothing either way.
 */
function namedTransport() {
  const hubs = new Map<string, MemoryHub>();
  return (name: string) => {
    let hub = hubs.get(name);
    if (!hub) hubs.set(name, (hub = new MemoryHub()));
    return hub.connect();
  };
}

describe('a namespace', () => {
  it('prefixes the bus name, so two apps on the same bare name do not meet', async () => {
    const transport = namedTransport();
    const checkout = createNamespace('checkout');
    const search = createNamespace('search');

    const theirs = checkout.createSharedStore('cart', { items: 0 }, { transport });
    const ours = search.createSharedStore('cart', { items: 0 }, { transport });

    theirs.set('items', 5);
    await tick();

    // Same bare name, different namespaces: they resolve to different buses, so
    // the write never reaches the other app.
    expect(ours.getSnapshot().items).toBe(0);

    theirs.close();
    ours.close();
  });

  it('still lets two copies of the same app meet', async () => {
    const transport = namedTransport();
    const a = createNamespace('checkout').createSharedStore('cart', { items: 0 }, { transport });
    const b = createNamespace('checkout').createSharedStore('cart', { items: 0 }, { transport });

    a.set('items', 5);
    await tick();

    expect(b.getSnapshot().items).toBe(5);

    a.close();
    b.close();
  });

  it('names the bus predictably, and falls back to the default name', () => {
    const checkout = createNamespace('checkout');

    expect(checkout.name).toBe('checkout');
    expect(checkout.busName('cart')).toBe('checkout:cart');
    // Omitting the name inside a namespace is safe in a way omitting it
    // globally is not: it still lands somewhere only this namespace uses.
    expect(checkout.busName()).toBe(`checkout:${DEFAULT_NAME}`);
  });

  it('refuses an empty name rather than silently un-namespacing everything', () => {
    expect(() => createNamespace('')).toThrow(/non-empty/);
  });

  it('covers every primitive, not a reduced subset', async () => {
    const transport = namedTransport();
    const ns = createNamespace('ns-all');

    const channel = ns.createChannel<{ ping: number }>('events', { transport });
    const presence = ns.createPresence('events', { transport });
    const leader = ns.createLeader('events', { strategy: 'heartbeat', transport });
    const store = ns.createSharedStore('events', { a: 1 }, { transport });

    const seen: number[] = [];
    channel.on('ping', (n) => seen.push(n));
    // A second copy of the same app, reaching the same namespaced bus.
    const peer = createNamespace('ns-all').createChannel<{ ping: number }>('events', { transport });
    peer.post('ping', 3);
    await tick();
    expect(seen).toEqual([3]);

    channel.close();
    presence.close();
    leader.close();
    store.close();
    peer.close();
  });
});
