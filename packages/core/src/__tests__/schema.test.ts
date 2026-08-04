import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChannel } from '../channel.js';
import { createSharedStore } from '../shared-store.js';
import type { InvalidPayload, StandardSchemaV1 } from '../schema.types.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

/**
 * The seam exists for one scenario: the sender is running a different build.
 * Without it a payload is *cast* to the receiving code's type rather than
 * checked against it — the one place in this library where a type is a hope,
 * and a rolling deploy is what turns it into a bug.
 *
 * Hand-written schemas rather than a Zod dependency, deliberately. Standard
 * Schema is a shape, not a package, and a test that builds the shape by hand
 * proves the seam accepts anything implementing it — which is the claim being
 * made.
 */
const isNumber: StandardSchemaV1<unknown, number> = {
  '~standard': {
    version: 1,
    vendor: 'handwritten',
    validate: (value) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'expected a number' }] },
  },
};

const asyncSchema: StandardSchemaV1<unknown, number> = {
  '~standard': {
    version: 1,
    vendor: 'slowpoke',
    validate: (value) => Promise.resolve({ value: value as number }),
  },
};

describe('a channel payload that fails its schema', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is dropped inbound rather than handed to the handler', async () => {
    const hub = new MemoryHub();
    const seen: unknown[] = [];
    const channel = createChannel<{ tick: number }>('sch-in', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
      onInvalid: () => {},
    });
    channel.on('tick', (payload) => seen.push(payload));

    // A peer on another build, sending what that build thought the shape was.
    const peer = createChannel<{ tick: unknown }>('sch-in', { transport: () => hub.connect() });
    peer.post('tick', 'not a number');
    peer.post('tick', 7);
    await tick();

    expect(seen).toEqual([7]);

    channel.close();
    peer.close();
  });

  it('throws outbound, so the bug is found in the tab that has it', () => {
    const hub = new MemoryHub();
    const channel = createChannel<{ tick: number }>('sch-out', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
      onInvalid: () => {},
    });

    expect(() => channel.post('tick', 'nope' as unknown as number)).toThrow(
      /does not match its schema/,
    );

    channel.close();
  });

  it('reports what happened through onInvalid', async () => {
    const hub = new MemoryHub();
    const reports: InvalidPayload[] = [];
    const channel = createChannel<{ tick: number }>('sch-report', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
      onInvalid: (info) => reports.push(info),
    });
    channel.on('tick', () => {});

    const peer = createChannel<{ tick: unknown }>('sch-report', {
      transport: () => hub.connect(),
    });
    peer.post('tick', 'bad');
    await tick();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      name: 'sch-report',
      key: 'tick',
      direction: 'in',
      payload: 'bad',
      issues: ['expected a number'],
    });

    channel.close();
    peer.close();
  });

  it('warns in development when nothing is observing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const channel = createChannel<{ tick: number }>('sch-warn', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
    });
    channel.on('tick', () => {});

    const peer = createChannel<{ tick: unknown }>('sch-warn', { transport: () => hub.connect() });
    peer.post('tick', 'bad');
    await tick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('inbound payload rejected');

    channel.close();
    peer.close();
  });

  it('warns about an outbound refusal too, naming this tab as the culprit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = new MemoryHub();
    const channel = createChannel<{ tick: number }>('sch-warn-out', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
    });

    expect(() => channel.post('tick', 'bad' as unknown as number)).toThrow();

    expect(warn.mock.calls[0]?.[0]).toContain('outbound payload rejected');

    channel.close();
  });

  it('leaves message types with no schema alone', async () => {
    const hub = new MemoryHub();
    const seen: unknown[] = [];
    const channel = createChannel<{ tick: number; anything: unknown }>('sch-partial', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
    });
    channel.on('anything', (payload) => seen.push(payload));

    const peer = createChannel<{ anything: unknown }>('sch-partial', {
      transport: () => hub.connect(),
    });
    // Adopting the seam one message at a time has to be possible, or nobody
    // adopts it at all.
    peer.post('anything', { shape: 'unchecked' });
    await tick();

    expect(seen).toEqual([{ shape: 'unchecked' }]);

    channel.close();
    peer.close();
  });

  it('does not validate a message nobody is listening for', async () => {
    const hub = new MemoryHub();
    const reports: InvalidPayload[] = [];
    const channel = createChannel<{ tick: number }>('sch-unheard', {
      transport: () => hub.connect(),
      schema: { tick: isNumber },
      onInvalid: (info) => reports.push(info),
    });

    const peer = createChannel<{ tick: unknown }>('sch-unheard', {
      transport: () => hub.connect(),
    });
    peer.post('tick', 'bad');
    await tick();

    // No handler means no consumer, and reporting a peer's payload as broken on
    // the say-so of a schema this tab never consults for it would be noise.
    expect(reports).toEqual([]);

    channel.close();
    peer.close();
  });
});

describe('an async schema', () => {
  it('is refused rather than silently awaited', () => {
    const hub = new MemoryHub();
    const reports: InvalidPayload[] = [];
    const channel = createChannel<{ tick: number }>('sch-async', {
      transport: () => hub.connect(),
      schema: { tick: asyncSchema },
      onInvalid: (info) => reports.push(info),
    });

    // Delivery on this bus is synchronous and documented as such, so a
    // validator that answers later cannot gate it. Refusing loudly beats
    // buffering every message behind a microtask, and beats letting the value
    // through while the schema thinks.
    expect(() => channel.post('tick', 1)).toThrow(/asynchronously/);
    expect(reports[0]?.issues[0]).toContain('slowpoke');

    channel.close();
  });
});

describe('a store value that fails its schema', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is dropped inbound, leaving the local value standing', async () => {
    const hub = new MemoryHub();
    const store = createSharedStore(
      'sch-store-in',
      { count: 0 },
      { transport: () => hub.connect(), schema: { count: isNumber }, onInvalid: () => {} },
    );
    const peer = createSharedStore(
      'sch-store-in',
      { count: 0 },
      { transport: () => hub.connect() },
    );

    peer.set('count', 'seven' as unknown as number);
    await tick();
    expect(store.getSnapshot().count).toBe(0);

    // And a good write from the same peer still lands, so this is the schema
    // rejecting a value rather than the peer being cut off.
    peer.set('count', 7);
    await tick();
    expect(store.getSnapshot().count).toBe(7);

    store.close();
    peer.close();
  });

  it('throws on a local write, before anything is applied', () => {
    const hub = new MemoryHub();
    const store = createSharedStore(
      'sch-store-out',
      { count: 0 },
      { transport: () => hub.connect(), schema: { count: isNumber }, onInvalid: () => {} },
    );

    expect(() => store.set('count', 'nope' as unknown as number)).toThrow(
      /does not match its schema/,
    );
    // All-or-nothing, the same guarantee the structured-clone pre-check gives.
    expect(store.getSnapshot().count).toBe(0);

    store.close();
  });

  it('is not consulted for a write that loses last-writer-wins anyway', async () => {
    const hub = new MemoryHub();
    const reports: InvalidPayload[] = [];
    const store = createSharedStore(
      'sch-store-stale',
      { count: 0 },
      {
        transport: () => hub.connect(),
        schema: { count: isNumber },
        onInvalid: (info) => reports.push(info),
      },
    );
    const peer = hub.connect();

    store.set('count', 5);
    // Counter 1 against the local counter 1 — this loses on the clientId tie
    // break or on the counter, either way it never reaches the state.
    peer.post({
      v: 1,
      scope: 'state',
      type: 'patch',
      key: 'count',
      value: 'bad',
      version: [0, 'aaa'],
      clientId: 'aaa',
      kind: 'tab',
    });
    await tick();

    expect(store.getSnapshot().count).toBe(5);
    expect(reports).toEqual([]);

    store.close();
    peer.close();
  });

  it('guards what comes back from disk, not just what comes off the wire', async () => {
    const hub = new MemoryHub();
    const reports: InvalidPayload[] = [];
    // State written by an older deploy: the same skew problem with a longer
    // fuse, because disk outlives the tab that wrote it.
    const saved = JSON.stringify({
      v: 1,
      state: { count: 'written by last month' },
      versions: { count: [9, 'old-deploy'] },
    });
    const store = createSharedStore(
      'sch-store-disk',
      { count: 0 },
      {
        transport: () => hub.connect(),
        schema: { count: isNumber },
        onInvalid: (info) => reports.push(info),
        persist: {
          adapter: { read: () => JSON.parse(saved) as never, write: () => {} },
        },
      },
    );

    expect(store.getSnapshot().count).toBe(0);
    expect(reports[0]).toMatchObject({ key: 'count', direction: 'in' });

    store.close();
  });
});
