// @vitest-environment happy-dom
// Needs real `document`, `addEventListener` and lifecycle events: most of what
// this file pins is the bus's behaviour around them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultKind, getBus } from '../bus.js';
import type { BusWire } from '../bus.types.js';
import { resetRendezvous } from '../rendezvous.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { NoopTransport } from '../transport/noop-transport.js';
import { tick } from './helpers/tick.js';

/**
 * The bus's own contract, as opposed to what the engines on top of it do.
 *
 * Written against surviving mutants: each case here is one the mutation run
 * showed nothing was checking — the presence wires the bus emits by itself, the
 * lifecycle listeners it attaches, and the refcount that decides when it dies.
 */
let n = 0;
const uniqueName = () => `bc-${++n}`;

/** Every wire a hub sees, so a test can assert on what the bus actually posts. */
const recorder = (hub: MemoryHub) => {
  const seen: BusWire[] = [];
  const wire = hub.connect();
  wire.subscribe((data) => seen.push(data as BusWire));
  return { seen, close: () => wire.close() };
};

const presenceOf = (seen: BusWire[], type: string) =>
  seen.filter((w) => w.scope === 'presence' && w.type === type);

describe('the presence wires the bus emits on its own', () => {
  afterEach(() => resetRendezvous());

  it('says hello when it is created', async () => {
    const hub = new MemoryHub();
    const rec = recorder(hub);
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    await tick();

    expect(presenceOf(rec.seen, 'hello')).toHaveLength(1);

    bus.release();
    rec.close();
  });

  it('answers another client hello with a ping, so joiners see it at once', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    const rec = recorder(hub);
    await tick();

    hub.connect().post({
      v: 1,
      scope: 'presence',
      type: 'hello',
      clientId: 'joiner',
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    // Without this a joiner waits a full heartbeat to learn anyone is here.
    expect(presenceOf(rec.seen, 'ping')).toHaveLength(1);

    bus.release();
    rec.close();
  });

  it('does not answer its own hello', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    const rec = recorder(hub);
    await tick();
    const before = presenceOf(rec.seen, 'ping').length;

    hub.connect().post({
      v: 1,
      scope: 'presence',
      type: 'hello',
      clientId: bus.clientId,
      kind: 'tab',
    } satisfies BusWire);
    await tick();

    expect(presenceOf(rec.seen, 'ping')).toHaveLength(before);

    bus.release();
    rec.close();
  });

  it('pings on the heartbeat it was given', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect(), heartbeatMs: 10 });
    const rec = recorder(hub);

    await new Promise((r) => setTimeout(r, 45));

    // Several, not one: the interval is the thing under test.
    expect(presenceOf(rec.seen, 'ping').length).toBeGreaterThanOrEqual(2);

    bus.release();
    rec.close();
  });

  it('says bye on pagehide, and on release', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    const rec = recorder(hub);
    await tick();

    dispatchEvent(new Event('pagehide'));
    await tick();
    expect(presenceOf(rec.seen, 'bye')).toHaveLength(1);

    bus.release();
    await tick();
    expect(presenceOf(rec.seen, 'bye')).toHaveLength(2);

    rec.close();
  });

  it('re-announces on a bfcache restore, but not on an ordinary pageshow', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    const rec = recorder(hub);
    await tick();
    const before = presenceOf(rec.seen, 'hello').length;

    const ordinary = new Event('pageshow') as Event & { persisted?: boolean };
    ordinary.persisted = false;
    dispatchEvent(ordinary);
    await tick();
    expect(presenceOf(rec.seen, 'hello')).toHaveLength(before);

    const restored = new Event('pageshow') as Event & { persisted?: boolean };
    restored.persisted = true;
    dispatchEvent(restored);
    await tick();
    expect(presenceOf(rec.seen, 'hello')).toHaveLength(before + 1);

    bus.release();
    rec.close();
  });

  it('re-announces when the tab becomes visible again', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    const rec = recorder(hub);
    await tick();
    const before = presenceOf(rec.seen, 'hello').length;

    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(presenceOf(rec.seen, 'hello')).toHaveLength(before);

    visibility.mockReturnValue('visible');
    dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(presenceOf(rec.seen, 'hello')).toHaveLength(before + 1);

    visibility.mockRestore();
    bus.release();
    rec.close();
  });

  it('stops listening once the last handle is released', async () => {
    const hub = new MemoryHub();
    const bus = getBus(uniqueName(), { transport: () => hub.connect() });
    await tick();
    bus.release();
    const rec = recorder(hub);

    dispatchEvent(new Event('pagehide'));
    dispatchEvent(new Event('visibilitychange'));
    await tick();

    // A shut-down bus that still answered lifecycle events would keep a dead
    // tab in every peer's roster.
    expect(rec.seen).toHaveLength(0);
    rec.close();
  });
});

describe('the refcount', () => {
  afterEach(() => resetRendezvous());

  it('keeps the bus alive until every handle lets go', async () => {
    const hub = new MemoryHub();
    const name = uniqueName();
    const first = getBus(name, { transport: () => hub.connect() });
    const second = getBus(name, { transport: () => hub.connect() });
    await tick();
    const rec = recorder(hub);

    first.release();
    await tick();
    // One `bye` for the released handle's own bus; the sibling is still live.
    const afterFirst = presenceOf(rec.seen, 'bye').length;

    second.release();
    await tick();
    expect(presenceOf(rec.seen, 'bye').length).toBeGreaterThan(afterFirst);

    rec.close();
  });

  it('ignores a second release from the same handle', async () => {
    // The shared rendezvous bus, not a hub: the refcount being tested is the
    // page-wide one, which a custom transport bypasses entirely.
    const name = uniqueName();
    const a = getBus(name, {});
    const b = getBus(name, {});
    await tick();

    a.release();
    a.release(); // must not decrement the shared count twice
    a.release();

    // If the double release had counted, this bus would already be shut down
    // and posting would be a no-op that never reaches the sibling.
    let heard = 0;
    b.subscribe(() => heard++);
    getBus(name, {}).post({
      v: 1,
      scope: 'state',
      type: 'hello',
      clientId: 'other',
      kind: 'tab',
    } satisfies BusWire);

    expect(heard).toBe(1);
    b.release();
  });
});

describe('what the bus reports about itself', () => {
  afterEach(() => resetRendezvous());

  it('calls itself a tab where there is a document', () => {
    expect(defaultKind()).toBe('tab');
  });

  it('calls a transport that names no kind custom', () => {
    const bus = getBus(uniqueName(), { transport: () => new NoopTransport() as never });
    // NoopTransport declares 'none'; a transport with no `kind` at all is the
    // custom case, and the fallback is what this pins.
    const bare = getBus(uniqueName(), {
      transport: () => ({ post: () => {}, subscribe: () => () => {}, close: () => {} }),
    });

    expect(bare.transportKind).toBe('custom');
    expect(bus.transportKind).toBe('none');

    bus.release();
    bare.release();
  });
});

describe('delivery between handles on one page', () => {
  afterEach(() => resetRendezvous());

  it('shares state and events with siblings, and never presence or leader', async () => {
    const name = uniqueName();
    const a = getBus(name, {});
    const b = getBus(name, {});
    const seen: BusWire[] = [];
    b.subscribe((wire) => seen.push(wire));

    for (const scope of ['state', 'event', 'op', 'presence', 'leader'] as const) {
      a.post({
        v: 1,
        scope,
        type: 'hello',
        ...(scope === 'event' ? { payload: null, msgId: 'm' } : {}),
        ...(scope === 'op' ? { key: 'default' } : {}),
        clientId: a.clientId,
        kind: 'tab',
      } as BusWire);
    }

    // A page is one client: presence and leadership are properties of the
    // client, so delivering them locally would make a page count itself.
    expect(seen.map((w) => w.scope)).toEqual(['state', 'event', 'op']);

    a.release();
    b.release();
  });
});
