import { describe, expect, it } from 'vitest';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

type State = { count: number; note: string };

function makeClient(hub: MemoryHub, initial: State = { count: 0, note: '' }) {
  return createSharedStore<State>('test', initial, { transport: () => hub.connect() });
}

describe('createSharedStore', () => {
  it('propagates set() to other clients', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const b = makeClient(hub);
    await tick(); // let hello/snapshot settle

    a.set('count', 1);
    await tick();

    expect(b.getSnapshot().count).toBe(1);
    expect(a.getSnapshot().count).toBe(1);
  });

  it('the state proxy syncs like set()', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const b = makeClient(hub);
    await tick();

    a.state.count++;
    a.state.note = 'from a';
    await tick();

    expect(b.getSnapshot()).toEqual({ count: 1, note: 'from a' });
  });

  it('supports functional set()', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    a.set('count', 5);
    a.set('count', (prev) => prev + 1);
    expect(a.getSnapshot().count).toBe(6);
  });

  it('concurrent writes converge on every client (LWW + tie-break)', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const b = makeClient(hub);
    const c = makeClient(hub);
    await tick();

    // Both write before either delivery happens: same counter, tie by clientId.
    a.set('note', 'from a');
    b.set('note', 'from b');
    await tick();

    const winner = [a, b].sort((x, y) => (x.clientId > y.clientId ? -1 : 1))[0]!;
    const expected = winner === a ? 'from a' : 'from b';
    expect(a.getSnapshot().note).toBe(expected);
    expect(b.getSnapshot().note).toBe(expected);
    expect(c.getSnapshot().note).toBe(expected);
  });

  it('late joiners hydrate from peer snapshots', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    a.set('count', 42);
    a.set('note', 'existing');
    await tick();

    const late = makeClient(hub); // posts hello; a answers with a snapshot
    await tick();

    expect(late.getSnapshot()).toEqual({ count: 42, note: 'existing' });
  });

  it('notifies global and per-key subscribers with origin meta', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const b = makeClient(hub);
    await tick();

    const events: Array<{ key: string; value: unknown; self: boolean }> = [];
    let keyPings = 0;
    b.subscribe((key, value, meta) => events.push({ key, value, self: meta.self }));
    b.subscribeKey('count', () => keyPings++);

    a.set('count', 7);
    b.set('note', 'local');
    await tick();

    expect(events).toContainEqual({ key: 'count', value: 7, self: false });
    expect(events).toContainEqual({ key: 'note', value: 'local', self: true });
    expect(keyPings).toBe(1); // note change must not ping count subscribers
  });

  it('unsubscribing global and per-key listeners stops notifications', () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    let globalCalls = 0;
    let keyCalls = 0;
    const offGlobal = a.subscribe(() => globalCalls++);
    const offKey = a.subscribeKey('count', () => keyCalls++);
    offGlobal();
    offKey();

    a.set('count', 1);

    expect(globalCalls).toBe(0);
    expect(keyCalls).toBe(0);
  });

  it('multiple per-key subscribers share one listener set', () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    let first = 0;
    let second = 0;
    a.subscribeKey('count', () => first++);
    a.subscribeKey('count', () => second++);

    a.set('count', 1);

    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('keeps the shared listener set alive until the last subscriber leaves', () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    let first = 0;
    let second = 0;
    const offFirst = a.subscribeKey('count', () => first++);
    a.subscribeKey('count', () => second++);

    // The bucket is dropped only when it empties — removing one of two
    // subscribers must not silently unsubscribe the other.
    offFirst();
    a.set('count', 1);

    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it('set() on a key missing from the initial shape starts its clock at 1', async () => {
    const hub = new MemoryHub();
    const a = createSharedStore<{ count: number; late?: string }>(
      'test',
      { count: 0 },
      { transport: () => hub.connect() },
    );
    a.set('late', 'hello');
    expect(a.getSnapshot().late).toBe('hello');
  });

  it('ignores snapshot entries that carry no version', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const raw = hub.connect();
    raw.post({
      v: 1,
      scope: 'state',
      type: 'snapshot',
      clientId: 'zz',
      kind: 'tab',
      state: { count: 77 },
      versions: {}, // malformed peer: value without a version
    });
    await tick();

    expect(a.getSnapshot().count).toBe(0);
  });

  it('registerKey adds a fresh key at version zero', () => {
    const hub = new MemoryHub();
    const a = createSharedStore<{ count: number; extra?: string }>(
      'test',
      { count: 0 },
      { transport: () => hub.connect() },
    );

    a.registerKey('extra', 'hello');
    expect(a.getSnapshot().extra).toBe('hello');

    a.registerKey('extra', 'ignored'); // no-op: first registration wins
    expect(a.getSnapshot().extra).toBe('hello');
  });

  it('the proxy rejects symbol keys', () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    expect(() => {
      (a.state as Record<symbol, unknown>)[Symbol('nope')] = 1;
    }).toThrow(TypeError);
  });

  it('registerKey loses to any existing remote write', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    a.set('count', 99);
    await tick();

    const b = makeClient(hub);
    await tick(); // snapshot already delivered count=99
    b.registerKey('count', 0);

    expect(b.getSnapshot().count).toBe(99);
  });

  it('snapshots are immutable and replaced per change', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const before = a.getSnapshot();
    a.set('count', 1);
    const after = a.getSnapshot();

    expect(before).not.toBe(after);
    expect(before.count).toBe(0);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it('closed stores stop receiving', async () => {
    const hub = new MemoryHub();
    const a = makeClient(hub);
    const b = makeClient(hub);
    await tick();

    b.close();
    a.set('count', 3);
    await tick();

    expect(b.getSnapshot().count).toBe(0);
  });
});
