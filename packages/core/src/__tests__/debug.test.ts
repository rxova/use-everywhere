import { describe, expect, it, vi } from 'vitest';
import { getBusNames } from '../bus.js';
import { createChannel } from '../channel.js';
import { enableDebug, observeBus } from '../debug.js';
import type { BusEvent } from '../debug.types.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

describe('observeBus', () => {
  it('captures wires posted by this client, which the transport alone never reveals', async () => {
    const hub = new MemoryHub();
    const seen: BusEvent[] = [];
    const stop = observeBus('dbg-out', (event) => seen.push(event));

    const channel = createChannel<{ ping: number }>('dbg-out', {
      transport: () => hub.connect(),
    });
    channel.post('ping', 1);
    await tick();

    const outbound = seen.filter((e) => e.direction === 'out');
    expect(outbound.map((e) => `${e.wire.scope}/${e.wire.type}`)).toContain('event/ping');
    expect(outbound.every((e) => e.name === 'dbg-out')).toBe(true);

    stop();
    channel.close();
  });

  it('contains a throwing observer: the bus survives and other observers still run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hub = new MemoryHub();
    const seen: BusEvent[] = [];
    const stopBroken = observeBus('dbg-throw', () => {
      throw new Error('spectator bug');
    });
    const stop = observeBus('dbg-throw', (event) => seen.push(event));

    const channel = createChannel<{ ping: number }>('dbg-throw', {
      transport: () => hub.connect(),
    });
    expect(() => channel.post('ping', 1)).not.toThrow();
    await tick();

    // The broken observer was reported, the healthy one still saw the wire.
    expect(error).toHaveBeenCalled();
    expect(seen.some((e) => e.wire.scope === 'event' && e.wire.type === 'ping')).toBe(true);

    stopBroken();
    stop();
    channel.close();
    error.mockRestore();
  });

  it('captures wires received from a peer', async () => {
    const hub = new MemoryHub();
    const seen: BusEvent[] = [];
    const stop = observeBus('dbg-in', (event) => seen.push(event));

    const a = createChannel<{ ping: number }>('dbg-in', { transport: () => hub.connect() });
    const b = createChannel<{ ping: number }>('dbg-in', { transport: () => hub.connect() });
    b.post('ping', 7);
    await tick();

    const inbound = seen.filter((e) => e.direction === 'in' && e.wire.scope === 'event');
    expect(inbound).toHaveLength(1);
    expect(inbound[0]?.wire).toMatchObject({ type: 'ping', payload: 7, clientId: b.clientId });

    stop();
    a.close();
    b.close();
  });

  it('observes a bus that does not exist yet', async () => {
    const hub = new MemoryHub();
    const seen: BusEvent[] = [];
    // Observe first, create second — the lookup happens at emit time.
    const stop = observeBus('dbg-later', (event) => seen.push(event));

    const channel = createChannel('dbg-later', { transport: () => hub.connect() });
    await tick();

    expect(seen.length).toBeGreaterThan(0);

    stop();
    channel.close();
  });

  it('never emits a wire this client posted back to itself', async () => {
    const hub = new MemoryHub();
    const seen: BusEvent[] = [];
    const stop = observeBus('dbg-echo', (event) => seen.push(event));

    const channel = createChannel<{ ping: number }>('dbg-echo', {
      transport: () => hub.connect(),
    });
    channel.post('ping', 1);
    await tick();

    // The self-echo drop in bus.ts runs before the 'in' emit, so our own wire
    // must appear exactly once — outbound — and never as inbound.
    const own = seen.filter((e) => e.wire.clientId === channel.clientId);
    expect(own.every((e) => e.direction === 'out')).toBe(true);

    stop();
    channel.close();
  });

  it('stops emitting after the returned function is called', async () => {
    const hub = new MemoryHub();
    const seen: BusEvent[] = [];
    const stop = observeBus('dbg-stop', (event) => seen.push(event));

    const channel = createChannel<{ ping: number }>('dbg-stop', {
      transport: () => hub.connect(),
    });
    stop();
    channel.post('ping', 1);
    await tick();

    expect(seen.filter((e) => e.wire.scope === 'event')).toHaveLength(0);

    // Unsubscribing twice is safe, and so is unsubscribing a name never observed.
    expect(() => stop()).not.toThrow();
    channel.close();
  });

  it('supports several observers on one bus, removing only the one that unsubscribed', async () => {
    const hub = new MemoryHub();
    const first: BusEvent[] = [];
    const second: BusEvent[] = [];
    const stopFirst = observeBus('dbg-many', (e) => first.push(e));
    const stopSecond = observeBus('dbg-many', (e) => second.push(e));

    const channel = createChannel<{ ping: number }>('dbg-many', {
      transport: () => hub.connect(),
    });
    stopFirst();
    channel.post('ping', 1);
    await tick();

    expect(first.filter((e) => e.wire.scope === 'event')).toHaveLength(0);
    expect(second.filter((e) => e.wire.scope === 'event')).toHaveLength(1);

    stopSecond();
    channel.close();
  });
});

describe('enableDebug', () => {
  it('logs both directions to the given sink', async () => {
    const hub = new MemoryHub();
    const log = vi.fn();
    const stop = enableDebug({ name: 'dbg-log', log });

    const a = createChannel<{ ping: number }>('dbg-log', { transport: () => hub.connect() });
    const b = createChannel<{ ping: number }>('dbg-log', { transport: () => hub.connect() });
    b.post('ping', 1);
    await tick();

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('→ event/ping'))).toBe(true);
    expect(lines.some((line) => line.includes('← event/ping'))).toBe(true);
    expect(lines.every((line) => line.startsWith('[use-everywhere:dbg-log]'))).toBe(true);

    stop();
    a.close();
    b.close();
  });

  it('defaults to the default bus name and the console', async () => {
    const hub = new MemoryHub();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stop = enableDebug();

    const channel = createChannel<{ ping: number }>('use-everywhere', {
      transport: () => hub.connect(),
    });
    channel.post('ping', 1);
    await tick();

    expect(spy).toHaveBeenCalled();

    stop();
    spy.mockRestore();
    channel.close();
  });
});

describe('getBusNames', () => {
  it('lists registry buses and omits custom-transport ones', () => {
    const hub = new MemoryHub();
    const registered = createChannel('names-registered');
    const custom = createChannel('names-custom', { transport: () => hub.connect() });

    expect(getBusNames()).toContain('names-registered');
    expect(getBusNames()).not.toContain('names-custom');

    registered.close();
    custom.close();
    expect(getBusNames()).not.toContain('names-registered');
  });
});
