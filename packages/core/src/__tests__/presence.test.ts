import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPresence } from '../presence.js';
import { MemoryHub } from '../transport/memory-hub.js';

describe('createPresence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sees peers join via hello and leave via bye', async () => {
    const hub = new MemoryHub();
    const options = { transport: () => hub.connect() };
    const a = createPresence('test', options);
    const b = createPresence('test', options);
    await vi.advanceTimersByTimeAsync(0);

    expect(a.getPeers().map((p) => p.id)).toEqual([b.clientId]);
    expect(b.getPeers().map((p) => p.id)).toEqual([a.clientId]);

    b.close(); // posts bye
    await vi.advanceTimersByTimeAsync(0);
    expect(a.getPeers()).toEqual([]);
  });

  it('prunes peers that go silent', async () => {
    const hub = new MemoryHub();
    const a = createPresence('test', { transport: () => hub.connect() });

    // A raw transport that says hello once and then goes silent (crashed tab).
    const ghost = hub.connect();
    ghost.post({ v: 1, scope: 'presence', type: 'hello', clientId: 'ghost1', kind: 'tab' });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.getPeers().map((p) => p.id)).toEqual(['ghost1']);

    await vi.advanceTimersByTimeAsync(8000); // prune ticks at 2.5s/5s/7.5s; 7.5s > 5s cutoff
    expect(a.getPeers()).toEqual([]);
  });

  it('keeps peers alive through heartbeat pings and piggybacked traffic', async () => {
    const hub = new MemoryHub();
    const options = { transport: () => hub.connect() };
    const a = createPresence('test', options);
    const b = createPresence('test', options);

    await vi.advanceTimersByTimeAsync(12_000); // many prune cycles
    expect(a.getPeers().map((p) => p.id)).toEqual([b.clientId]);

    b.close();
    a.close();
  });

  it('notifies subscribers on membership changes only', async () => {
    const hub = new MemoryHub();
    const options = { transport: () => hub.connect() };
    const a = createPresence('test', options);
    let calls = 0;
    a.subscribe(() => calls++);

    const b = createPresence('test', options);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(4000); // pings arrive, membership unchanged
    expect(calls).toBe(1);

    b.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
  });
});
