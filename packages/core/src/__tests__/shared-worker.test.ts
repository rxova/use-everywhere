import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SharedWorkerTransport,
  isSharedWorkerAvailable,
  type MessagePortLike,
  type SharedWorkerLike,
} from '../transport/shared-worker-transport.js';
import { startRelay, type RelayPort, type RelayScope } from '../shared-worker.js';
import { createSharedStore } from '../shared-store.js';

/**
 * A port pair the way the browser gives them out: what a tab posts arrives at
 * the relay's end, and vice versa. Everything below is built from these, so the
 * tests exercise the same asymmetry the real thing has — a port never hears
 * itself.
 */
class FakePort implements MessagePortLike, RelayPort {
  started = false;
  closed = false;
  sent: unknown[] = [];
  private listeners = new Set<(event: { data: unknown }) => void>();
  /** Set to throw on postMessage, standing in for an entangled dead port. */
  broken = false;

  postMessage(data: unknown): void {
    if (this.broken) throw new Error('port is dead');
    this.sent.push(data);
  }
  start(): void {
    this.started = true;
  }
  close(): void {
    this.closed = true;
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
  /** Deliver a message *to* this port, as the other end would. */
  deliver(data: unknown): void {
    for (const listener of this.listeners) listener({ data });
  }
}

const workerWith = (port: MessagePortLike): SharedWorkerLike => ({ port });

describe('SharedWorkerTransport', () => {
  let port: FakePort;
  let transport: SharedWorkerTransport;

  beforeEach(() => {
    port = new FakePort();
    transport = new SharedWorkerTransport({ url: '/relay.js', factory: () => workerWith(port) });
  });

  it('starts the port, because addEventListener alone never dispatches', () => {
    expect(port.started).toBe(true);
  });

  it('passes the url and the bus name to the factory', () => {
    const factory = vi.fn(() => workerWith(new FakePort()));
    new SharedWorkerTransport({ url: new URL('https://app.test/relay.js'), name: 'cart', factory });
    expect(factory).toHaveBeenCalledWith('https://app.test/relay.js', 'cart');
  });

  it('defaults the worker name, so two apps on one origin can differ by it', () => {
    const factory = vi.fn(() => workerWith(new FakePort()));
    new SharedWorkerTransport({ url: '/relay.js', factory });
    expect(factory).toHaveBeenCalledWith('/relay.js', 'use-everywhere');
  });

  it('posts through the port and delivers what arrives to every subscriber', () => {
    const seen: unknown[] = [];
    transport.subscribe((data) => seen.push(data));
    transport.subscribe((data) => seen.push(data));

    transport.post({ hello: 'peers' });
    expect(port.sent).toEqual([{ hello: 'peers' }]);

    port.deliver({ from: 'another tab' });
    expect(seen).toEqual([{ from: 'another tab' }, { from: 'another tab' }]);
  });

  it('stops delivering to an unsubscribed listener', () => {
    const seen: unknown[] = [];
    const off = transport.subscribe((data) => seen.push(data));
    off();
    port.deliver('ignored');
    expect(seen).toEqual([]);
  });

  it('closes the port once, and goes quiet afterwards', () => {
    const seen: unknown[] = [];
    transport.subscribe((data) => seen.push(data));

    transport.close();
    expect(port.closed).toBe(true);

    // A second close must not throw or re-close: stores close transports on
    // unmount, and an unmount can be re-entered.
    port.closed = false;
    transport.close();
    expect(port.closed).toBe(false);

    transport.post('after close');
    expect(port.sent).toEqual([]);
    port.deliver('after close');
    expect(seen).toEqual([]);
  });

  it('declares its kind, so getTransportKind can report it', () => {
    expect(transport.kind).toBe('shared-worker');
  });

  it('uses globalThis.SharedWorker when no factory is given', () => {
    const constructed: { url: string; options: unknown }[] = [];
    class FakeSharedWorker {
      port = new FakePort();
      constructor(url: string, options: unknown) {
        constructed.push({ url, options });
      }
    }
    vi.stubGlobal('SharedWorker', FakeSharedWorker);
    try {
      expect(isSharedWorkerAvailable()).toBe(true);
      new SharedWorkerTransport({ url: '/relay.js', name: 'cart' });
      expect(constructed).toEqual([{ url: '/relay.js', options: { name: 'cart' } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports SharedWorker as unavailable where the constructor is missing', () => {
    expect(isSharedWorkerAvailable()).toBe(false);
  });
});

describe('startRelay', () => {
  const connect = (scope: RelayScope, port: RelayPort) => {
    scope.onconnect?.({ ports: [port] });
  };

  it('fans a message out to the other ports and never back to the sender', () => {
    const scope: RelayScope = { onconnect: null };
    startRelay(scope);
    const a = new FakePort();
    const b = new FakePort();
    const c = new FakePort();
    connect(scope, a);
    connect(scope, b);
    connect(scope, c);

    a.deliver({ count: 1 });

    expect(a.sent).toEqual([]);
    expect(b.sent).toEqual([{ count: 1 }]);
    expect(c.sent).toEqual([{ count: 1 }]);
  });

  it('starts each port it accepts', () => {
    const scope: RelayScope = { onconnect: null };
    startRelay(scope);
    const port = new FakePort();
    connect(scope, port);
    expect(port.started).toBe(true);
  });

  it('ignores a connect event with no port', () => {
    const scope: RelayScope = { onconnect: null };
    startRelay(scope);
    expect(() => scope.onconnect?.({ ports: [] })).not.toThrow();
  });

  it('drops a dead port instead of letting it stop delivery to the living', () => {
    const scope: RelayScope = { onconnect: null };
    startRelay(scope);
    const sender = new FakePort();
    const dead = new FakePort();
    const alive = new FakePort();
    connect(scope, sender);
    connect(scope, dead);
    connect(scope, alive);
    dead.broken = true;

    sender.deliver('first');
    expect(alive.sent).toEqual(['first']);

    // Pruned: the second send must not even attempt the corpse. Un-break it and
    // prove nothing arrives, which only holds if it left the set.
    dead.broken = false;
    sender.deliver('second');
    expect(dead.sent).toEqual([]);
    expect(alive.sent).toEqual(['first', 'second']);
  });

  it('installs itself on a worker scope on import, and stays inert elsewhere', async () => {
    vi.resetModules();
    const scope = { onconnect: null } as RelayScope;
    vi.stubGlobal('self', scope);
    try {
      const module = await import('../shared-worker.js');
      expect(typeof scope.onconnect).toBe('function');
      // The installed relay is exported, so a worker that does other work can
      // join the bus without calling startRelay again — which would install a
      // second relay over this one and strand the ports this handler holds.
      expect(module.relay).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('has no relay to export outside a worker', async () => {
    vi.resetModules();
    try {
      const module = await import('../shared-worker.js');
      expect(module.relay).toBeUndefined();
    } finally {
      vi.resetModules();
    }
  });

  it('broadcasts to every port, the relay itself having nothing to echo to', () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const a = new FakePort();
    const b = new FakePort();
    connect(scope, a);
    connect(scope, b);

    relay.broadcast({ from: 'the worker' });

    expect(a.sent).toEqual([{ from: 'the worker' }]);
    expect(b.sent).toEqual([{ from: 'the worker' }]);
  });

  it('prunes a dead port when the relay itself is the sender', () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const dead = new FakePort();
    const alive = new FakePort();
    connect(scope, dead);
    connect(scope, alive);
    dead.broken = true;

    relay.broadcast('first');
    expect(alive.sent).toEqual(['first']);

    dead.broken = false;
    relay.broadcast('second');
    expect(dead.sent).toEqual([]);
    expect(alive.sent).toEqual(['first', 'second']);
  });

  it('counts the ports it holds, and not its own seats', () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    expect(relay.size).toBe(0);

    connect(scope, new FakePort());
    connect(scope, new FakePort());
    expect(relay.size).toBe(2);

    // The worker is not one of its own tabs: a seat must not keep `size` above
    // zero, or "idle the socket when nobody is looking" never fires.
    const seat = relay.connect();
    expect(relay.size).toBe(2);
    seat.close();
    expect(relay.size).toBe(2);
  });

  it('forgets a port that died, in the count as well as the fan-out', () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const sender = new FakePort();
    const dead = new FakePort();
    connect(scope, sender);
    connect(scope, dead);
    dead.broken = true;

    sender.deliver('anything');
    expect(relay.size).toBe(1);
  });
});

describe('the relay as a peer of itself', () => {
  const connect = (scope: RelayScope, port: RelayPort) => {
    scope.onconnect?.({ ports: [port] });
  };

  /** The seat delivers on a microtask, so every assertion waits one out. */
  const tick = () => Promise.resolve();

  it('declares the kind the transport does, so diagnostics agree', () => {
    const relay = startRelay({ onconnect: null });
    expect(relay.connect().kind).toBe('shared-worker');
  });

  it('receives what a port sends', async () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const tab = new FakePort();
    connect(scope, tab);

    const seen: unknown[] = [];
    relay.connect().subscribe((data) => seen.push(data));

    tab.deliver({ hello: 'worker' });
    expect(seen).toEqual([]); // not synchronously, inside the tab's listener
    await tick();
    expect(seen).toEqual([{ hello: 'worker' }]);
  });

  it('sends to every port', () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const a = new FakePort();
    const b = new FakePort();
    connect(scope, a);
    connect(scope, b);

    relay.connect().post({ tick: 1 });

    expect(a.sent).toEqual([{ tick: 1 }]);
    expect(b.sent).toEqual([{ tick: 1 }]);
  });

  it('never hears its own post — the invariant every engine rests on', async () => {
    const relay = startRelay({ onconnect: null });
    const seen: unknown[] = [];
    const seat = relay.connect();
    seat.subscribe((data) => seen.push(data));

    seat.post('mine');
    await tick();
    expect(seen).toEqual([]);
  });

  it('keeps two seats independent, each hearing the other and not itself', async () => {
    const relay = startRelay({ onconnect: null });
    const first: unknown[] = [];
    const second: unknown[] = [];
    const a = relay.connect();
    const b = relay.connect();
    a.subscribe((data) => first.push(data));
    b.subscribe((data) => second.push(data));

    a.post('from a');
    await tick();
    expect(first).toEqual([]);
    expect(second).toEqual(['from a']);
  });

  it('stops delivering to an unsubscribed listener', async () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const tab = new FakePort();
    connect(scope, tab);

    const seen: unknown[] = [];
    const off = relay.connect().subscribe((data) => seen.push(data));
    off();

    tab.deliver('ignored');
    await tick();
    expect(seen).toEqual([]);
  });

  it('leaves the bus on close, and goes quiet in both directions', async () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);
    const tab = new FakePort();
    connect(scope, tab);

    const seen: unknown[] = [];
    const seat = relay.connect();
    seat.subscribe((data) => seen.push(data));

    seat.close();
    // Stores close transports on unmount, and an unmount can be re-entered.
    expect(() => seat.close()).not.toThrow();

    seat.post('after close');
    expect(tab.sent).toEqual([]);

    tab.deliver('after close');
    await tick();
    expect(seen).toEqual([]);
  });
});

/**
 * The reason `connect()` exists: a worker that owns the socket publishes
 * through a real store, over the same relay its tabs are connected to. If this
 * passes, worker-side code never has to know the wire format.
 */
describe('a worker store reaching a tab store, through the relay', () => {
  /**
   * An entangled port pair, the way the browser hands them out: what one end
   * posts arrives at the other. `FakePort` is one-directional by design, so a
   * two-sided test needs both halves wired together.
   */
  const portPair = () => {
    const tabSide = new FakePort();
    const relaySide = new FakePort();
    const wire = (from: FakePort, to: FakePort) => {
      const post = from.postMessage.bind(from);
      from.postMessage = (data: unknown) => {
        post(data);
        // Async, as a real MessagePort is — synchronous delivery here would
        // hide re-entrancy the browser would have exposed.
        queueMicrotask(() => to.deliver(data));
      };
    };
    wire(tabSide, relaySide);
    wire(relaySide, tabSide);
    return { tabSide, relaySide };
  };

  /**
   * Drains microtasks *and* timers: patches ride a microtask, but the
   * late-joiner snapshot reply is deliberately delayed so peers do not all
   * answer at once.
   */
  const settle = async () => {
    // Long enough to clear the default 40ms snapshot delay.
    await new Promise((resolve) => setTimeout(resolve, 80));
  };

  it('delivers a worker write to the tab, and a tab write to the worker', async () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);

    const { tabSide, relaySide } = portPair();
    scope.onconnect?.({ ports: [relaySide] });

    const tab = createSharedStore(
      'feed',
      { tick: 0 },
      {
        transport: () =>
          new SharedWorkerTransport({ url: '/r.js', factory: () => ({ port: tabSide }) }),
      },
    );
    const worker = createSharedStore('feed', { tick: 0 }, { transport: () => relay.connect() });

    worker.set('tick', 7);
    await settle();
    expect(tab.getSnapshot().tick).toBe(7);

    tab.set('tick', 9);
    await settle();
    expect(worker.getSnapshot().tick).toBe(9);

    tab.close();
    worker.close();
  });

  it('hydrates a late worker from the tab that was already there', async () => {
    const scope: RelayScope = { onconnect: null };
    const relay = startRelay(scope);

    const { tabSide, relaySide } = portPair();
    scope.onconnect?.({ ports: [relaySide] });

    const tab = createSharedStore(
      'feed',
      { tick: 0 },
      {
        transport: () =>
          new SharedWorkerTransport({ url: '/r.js', factory: () => ({ port: tabSide }) }),
      },
    );
    tab.set('tick', 42);
    await settle();

    // The worker joins afterwards and asks; the handshake is the engines' job,
    // and it works here only because the seat is a peer like any other.
    const worker = createSharedStore('feed', { tick: 0 }, { transport: () => relay.connect() });
    await settle();
    expect(worker.getSnapshot().tick).toBe(42);

    tab.close();
    worker.close();
  });
});
