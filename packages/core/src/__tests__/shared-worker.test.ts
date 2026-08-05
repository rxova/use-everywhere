import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SharedWorkerTransport,
  isSharedWorkerAvailable,
  type MessagePortLike,
  type SharedWorkerLike,
} from '../transport/shared-worker-transport.js';
import { startRelay, type RelayPort, type RelayScope } from '../shared-worker.js';

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
      await import('../shared-worker.js');
      expect(typeof scope.onconnect).toBe('function');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
