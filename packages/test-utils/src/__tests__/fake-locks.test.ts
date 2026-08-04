import { describe, expect, it } from 'vitest';
import type { LockManagerLike } from '@use-everywhere/core';
import { FakeLockManager } from '../fake-locks.js';
import { tick } from '../timing.js';

/** Hold a lock until the returned function is called. */
const hold = (locks: LockManagerLike, name: string) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const done = locks.request(name, {}, () => held);
  return { release, done };
};

describe('FakeLockManager', () => {
  it('grants one holder at a time, in the order they asked', async () => {
    const locks = new FakeLockManager();
    const order: string[] = [];

    const first = hold(locks, 'seat');
    await tick();
    expect(locks.isHeld('seat')).toBe(true);

    void locks.request('seat', {}, async () => {
      order.push('second');
    });
    void locks.request('seat', {}, async () => {
      order.push('third');
    });
    expect(locks.queued('seat')).toBe(2);

    first.release();
    await first.done;
    await tick();

    expect(order).toEqual(['second', 'third']);
    expect(locks.isHeld('seat')).toBe(false);
  });

  it('names the owner a tagged request came from', async () => {
    const locks = new FakeLockManager();
    hold(locks.forOwner('tab-1'), 'seat');
    await tick();

    expect(locks.holder('seat')).toBe('tab-1');
    expect(locks.holder('other')).toBeUndefined();
    expect(locks.queued('never-asked-for')).toBe(0);
  });

  it('reclaims what a crashed owner held, and hands it to the next in line', async () => {
    const locks = new FakeLockManager();
    const crashed = locks.forOwner('tab-1');
    hold(crashed, 'seat');
    await tick();

    let took = false;
    void locks.forOwner('tab-2').request('seat', {}, async () => {
      took = true;
    });

    locks.reclaim('tab-1');
    await tick();

    expect(took).toBe(true);
  });

  it('forgets a crashed owner that was still waiting', async () => {
    const locks = new FakeLockManager();
    const first = hold(locks, 'seat');
    await tick();

    let took = false;
    void locks.forOwner('tab-2').request('seat', {}, async () => {
      took = true;
    });
    let survived = false;
    void locks.forOwner('tab-3').request('seat', {}, async () => {
      survived = true;
    });
    expect(locks.queued('seat')).toBe(2);

    locks.reclaim('tab-2');
    expect(locks.queued('seat')).toBe(1);

    first.release();
    await tick();

    // Only the crashed tab is forgotten; the one still alive takes the seat.
    expect(took).toBe(false);
    expect(survived).toBe(true);
  });

  it('does not let a reclaimed holder release the lock out from under its successor', async () => {
    const locks = new FakeLockManager();
    const crashed = hold(locks.forOwner('tab-1'), 'seat');
    await tick();

    hold(locks.forOwner('tab-2'), 'seat');
    locks.reclaim('tab-1');
    await tick();
    expect(locks.holder('seat')).toBe('tab-2');

    // The crashed tab's callback settling late must not free tab-2's seat.
    crashed.release();
    await crashed.done;
    await tick();

    expect(locks.holder('seat')).toBe('tab-2');
  });

  it('rejects a request whose signal was already aborted', async () => {
    const locks = new FakeLockManager();
    const controller = new AbortController();
    controller.abort();

    await expect(
      locks.request('seat', { signal: controller.signal }, async () => {}),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects a waiter that gives up before its turn', async () => {
    const locks = new FakeLockManager();
    const first = hold(locks, 'seat');
    await tick();

    const controller = new AbortController();
    const waiting = locks.request('seat', { signal: controller.signal }, async () => {});
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(locks.queued('seat')).toBe(0);

    first.release();
    await first.done;
  });

  it('ignores an abort that arrives after the lock was granted', async () => {
    const locks = new FakeLockManager();
    const first = hold(locks, 'seat');
    await tick();

    const controller = new AbortController();
    const second = hold(locks, 'seat');
    void locks.request('seat', { signal: controller.signal }, async () => {});

    first.release();
    await first.done;
    await tick();
    second.release();
    await second.done;
    await tick();

    // The waiter has long since had its turn; aborting now must not reject a
    // settled request, and must not disturb the queue.
    expect(() => controller.abort()).not.toThrow();
    expect(locks.queued('seat')).toBe(0);
  });

  it('releases the lock even when the callback throws', async () => {
    const locks = new FakeLockManager();
    await locks.request('seat', {}, () => Promise.reject(new Error('boom')));

    expect(locks.isHeld('seat')).toBe(false);
  });
});
