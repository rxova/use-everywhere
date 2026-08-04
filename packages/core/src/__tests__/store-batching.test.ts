import { describe, expect, it } from 'vitest';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { snapshotWindow, tick } from './helpers/tick.js';

type Shape = Record<string, unknown>;

const build = (hub: MemoryHub, name = 'batch', initial: Shape = {}) =>
  createSharedStore<Shape>(name, initial, { transport: () => hub.connect() });

describe('transaction', () => {
  it('notifies once for a group of writes, with the settled state', () => {
    const hub = new MemoryHub();
    const store = build(hub, 'tx-one', { first: '', last: '' });
    const seen: Shape[] = [];
    store.subscribe(() => seen.push(store.getSnapshot()));

    store.transaction(() => {
      store.set('first', 'Ada');
      store.set('last', 'Lovelace');
    });

    // One notification per changed key is still the contract — what changes is
    // that every one of them sees the *finished* state, and the snapshot is
    // rebuilt once rather than per key.
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ first: 'Ada', last: 'Lovelace' });
    expect(seen[1]).toEqual({ first: 'Ada', last: 'Lovelace' });

    store.close();
  });

  it('gives subscribers no half-applied view', () => {
    const hub = new MemoryHub();
    const store = build(hub, 'tx-half', { a: 0, b: 0 });
    const observed: string[] = [];
    store.subscribe(() => {
      const { a, b } = store.getSnapshot();
      observed.push(`${String(a)}/${String(b)}`);
    });

    store.transaction(() => {
      store.set('a', 1);
      store.set('b', 1);
    });

    // Without batching the first callback saw a=1,b=0 — a state no tab ever
    // intended, visible only from inside the loop applying it.
    expect(observed).toEqual(['1/1', '1/1']);

    store.close();
  });

  it('returns what the function returns', () => {
    const hub = new MemoryHub();
    const store = build(hub, 'tx-return', { a: 0 });

    expect(store.transaction(() => 'done')).toBe('done');

    store.close();
  });

  it('nests, flushing only at the outermost call', () => {
    const hub = new MemoryHub();
    const store = build(hub, 'tx-nest', { a: 0, b: 0 });
    let flushes = 0;
    store.subscribe(() => flushes++);

    store.transaction(() => {
      store.set('a', 1);
      store.transaction(() => {
        store.set('b', 1);
        expect(flushes).toBe(0); // inner call must not flush
      });
      expect(flushes).toBe(0);
    });

    expect(flushes).toBe(2);
    store.close();
  });

  it('still delivers the writes that landed when the function throws', () => {
    const hub = new MemoryHub();
    const store = build(hub, 'tx-throw', { a: 0, b: 0 });
    const seen: string[] = [];
    store.subscribe((key) => seen.push(key));

    expect(() =>
      store.transaction(() => {
        store.set('a', 1);
        throw new Error('halfway');
      }),
    ).toThrow('halfway');

    // The write already happened and already went on the wire; swallowing the
    // notification would leave this tab quietly behind its own peers.
    expect(seen).toEqual(['a']);
    expect(store.getSnapshot().a).toBe(1);

    store.close();
  });
});

describe('answering a late joiner', () => {
  it('sends one snapshot however many peers could have sent it', async () => {
    const hub = new MemoryHub();
    const peers = Array.from({ length: 5 }, () => build(hub, 'storm', { a: 0 }));
    peers[0]?.set('a', 1);
    await snapshotWindow();

    // Count what a joiner actually receives.
    const watcher = hub.connect();
    let snapshots = 0;
    watcher.subscribe((data) => {
      const wire = data as { scope?: string; type?: string };
      if (wire.scope === 'state' && wire.type === 'snapshot') snapshots++;
    });

    const joiner = build(hub, 'storm', { a: 0 });
    await snapshotWindow();

    // Five peers, one answer. Before this, joining a room cost one full copy of
    // the state per person already in it.
    expect(snapshots).toBe(1);
    expect(joiner.getSnapshot().a).toBe(1);

    for (const peer of peers) peer.close();
    joiner.close();
    watcher.close();
  });

  it('still hydrates a joiner when there is only one peer', async () => {
    const hub = new MemoryHub();
    const only = build(hub, 'storm-solo', { a: 0 });
    only.set('a', 7);
    await tick();

    const joiner = build(hub, 'storm-solo', { a: 0 });
    await snapshotWindow();

    expect(joiner.getSnapshot().a).toBe(7);

    only.close();
    joiner.close();
  });

  it('is not silenced by a peer that knows less than it does', async () => {
    const hub = new MemoryHub();
    const informed = build(hub, 'storm-partial', { a: 0, b: 0 });
    informed.set('a', 1);
    informed.set('b', 2);
    await snapshotWindow();

    // A peer holding only part of the state. Cancelling on *any* snapshot would
    // let this one answer first and leave the joiner missing `b` — which is how
    // an empty joiner could silence the tab that actually had the data.
    const partial = build(hub, 'storm-partial', { a: 0, b: 0 });
    await snapshotWindow();
    partial.set('a', 1);
    await tick();

    const joiner = build(hub, 'storm-partial', { a: 0, b: 0 });
    await snapshotWindow();

    expect(joiner.getSnapshot()).toEqual({ a: 1, b: 2 });

    informed.close();
    partial.close();
    joiner.close();
  });

  it('says nothing when it has nothing written to say', async () => {
    const hub = new MemoryHub();
    const empty = build(hub, 'storm-empty', { a: 0 });
    await snapshotWindow();

    const watcher = hub.connect();
    let snapshots = 0;
    watcher.subscribe((data) => {
      const wire = data as { scope?: string; type?: string };
      if (wire.scope === 'state' && wire.type === 'snapshot') snapshots++;
    });

    const joiner = build(hub, 'storm-empty', { a: 0 });
    await snapshotWindow();

    // Registered initials are not data. Answering with them would only crowd
    // out a peer that has something real.
    expect(snapshots).toBe(0);

    empty.close();
    joiner.close();
    watcher.close();
  });

  it('answers two joiners arriving together with the same single broadcast', async () => {
    const hub = new MemoryHub();
    const peer = build(hub, 'storm-two', { a: 0 });
    peer.set('a', 3);
    await snapshotWindow();

    const watcher = hub.connect();
    let snapshots = 0;
    watcher.subscribe((data) => {
      const wire = data as { scope?: string; type?: string };
      if (wire.scope === 'state' && wire.type === 'snapshot') snapshots++;
    });

    const first = build(hub, 'storm-two', { a: 0 });
    const second = build(hub, 'storm-two', { a: 0 });
    await snapshotWindow();

    // A snapshot is a broadcast, so one reply serves everyone waiting on one.
    expect(snapshots).toBe(1);
    expect(first.getSnapshot().a).toBe(3);
    expect(second.getSnapshot().a).toBe(3);

    peer.close();
    first.close();
    second.close();
    watcher.close();
  });
});
