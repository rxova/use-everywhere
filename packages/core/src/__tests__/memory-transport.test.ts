import { describe, expect, it } from 'vitest';
import { MemoryHub } from '../transport/memory-hub.js';
import { tick } from './helpers/tick.js';

describe('MemoryTransport', () => {
  it('delivers to every other transport but never echoes to the sender', async () => {
    const hub = new MemoryHub();
    const [a, b, c] = [hub.connect(), hub.connect(), hub.connect()];
    const got: Record<string, unknown[]> = { a: [], b: [], c: [] };
    a.subscribe((d) => got.a!.push(d));
    b.subscribe((d) => got.b!.push(d));
    c.subscribe((d) => got.c!.push(d));

    a.post('hi');
    await tick();

    expect(got.a).toEqual([]);
    expect(got.b).toEqual(['hi']);
    expect(got.c).toEqual(['hi']);
  });

  it('delivers structured clones, never references', async () => {
    const hub = new MemoryHub();
    const a = hub.connect();
    const b = hub.connect();
    const got: unknown[] = [];
    b.subscribe((d) => got.push(d));

    const payload = { nested: { n: 1 } };
    a.post(payload);
    payload.nested.n = 99; // mutate after post, before delivery
    await tick();

    // The receiver sees the value as it was posted — identity (and later
    // mutations) never cross the wire, exactly like the real BroadcastChannel.
    expect(got[0]).toEqual({ nested: { n: 1 } });
    expect(got[0]).not.toBe(payload);
  });

  it('throws on non-cloneable payloads at post time, even with nobody listening', () => {
    const hub = new MemoryHub();
    const a = hub.connect();

    expect(() => a.post({ cb: () => {} })).toThrow();
  });

  it('posting after close is a silent no-op', async () => {
    const hub = new MemoryHub();
    const a = hub.connect();
    const b = hub.connect();
    const got: unknown[] = [];
    b.subscribe((d) => got.push(d));

    a.close();
    a.post('ghost');
    await tick();

    expect(got).toEqual([]);
  });

  it('stops delivering after close', async () => {
    const hub = new MemoryHub();
    const a = hub.connect();
    const b = hub.connect();
    const got: unknown[] = [];
    b.subscribe((d) => got.push(d));

    b.close();
    a.post('hi');
    await tick();

    expect(got).toEqual([]);
  });
});
