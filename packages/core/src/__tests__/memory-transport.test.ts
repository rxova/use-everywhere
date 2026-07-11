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
