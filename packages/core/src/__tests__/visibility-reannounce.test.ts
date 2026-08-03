// @vitest-environment happy-dom
// While a tab is hidden its timers are clamped to roughly one tick a minute, so
// its heartbeat all but stops and peers can reasonably conclude it is gone.
// Coming back to the foreground is the moment it can cheaply prove otherwise —
// and after a laptop wakes, every tab on the origin is in exactly that position
// at once, so waiting for the next (still slow) heartbeat means a roster that is
// wrong for everybody simultaneously.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '../bus.js';
import type { BusWire } from '../bus.types.js';
import { MemoryHub } from '../transport/memory-hub.js';

/** happy-dom's visibilityState is a getter; override it on the instance only. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

describe('re-announcing on visibilitychange', () => {
  let hub: MemoryHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new MemoryHub();
  });
  afterEach(() => {
    vi.useRealTimers();
    // Hand visibilityState back to happy-dom rather than leaving a stub behind
    // for the next file in the run.
    Reflect.deleteProperty(document, 'visibilityState');
  });

  const hellosOf = (heard: BusWire[]) =>
    heard.filter((w) => w.scope === 'presence' && w.type === 'hello');

  it('says hello when the tab becomes visible, and stays quiet when it goes hidden', async () => {
    const bus = getBus('vis-bus', { transport: () => hub.connect() });
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));

    // Going away is not news: peers time us out on their own, and a `hello`
    // from a tab that is about to stop heartbeating would only invite pings
    // nobody is awake to hear.
    setVisibility('hidden');
    dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(hellosOf(heard)).toHaveLength(0);

    setVisibility('visible');
    dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(hellosOf(heard)).toHaveLength(1);

    bus.release();
    rogue.close();
  });

  it('stops re-announcing once the bus is released', async () => {
    const bus = getBus('vis-released', { transport: () => hub.connect() });
    const rogue = hub.connect();
    const heard: BusWire[] = [];
    rogue.subscribe((data) => heard.push(data as BusWire));

    bus.release();

    setVisibility('visible');
    dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    // A leaked listener here would be a page that keeps talking on a bus it has
    // already torn down — every foreground switch, forever.
    expect(hellosOf(heard)).toHaveLength(0);
    rogue.close();
  });

  it('lets a peer that gave up on a hidden tab re-add it the moment it returns', async () => {
    // The end-to-end shape of the fix: the returning tab announces, and the
    // watcher answers, so both rosters are correct within one round trip
    // instead of one heartbeat.
    const bus = getBus('vis-rejoin', { transport: () => hub.connect() });
    const watcher = hub.connect();
    watcher.subscribe((data) => {
      const wire = data as BusWire;
      if (wire.scope === 'presence' && wire.type === 'hello' && wire.clientId !== 'watcher') {
        watcher.post({ v: 1, scope: 'presence', type: 'ping', clientId: 'watcher', kind: 'tab' });
      }
    });
    const seen: BusWire[] = [];
    bus.subscribe((wire) => seen.push(wire));

    setVisibility('visible');
    dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(seen.some((w) => w.scope === 'presence' && w.clientId === 'watcher')).toBe(true);

    bus.release();
    watcher.close();
  });
});
