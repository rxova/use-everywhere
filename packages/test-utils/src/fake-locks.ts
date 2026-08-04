import type { LockManagerLike } from '@use-everywhere/core';

type Hold = { readonly owner: string | undefined; readonly id: number };
type Waiter = { readonly owner: string | undefined; readonly grant: () => void };

/** What `navigator.locks` rejects with when a request is abandoned. */
const abortError = (): Error => new DOMException('The operation was aborted.', 'AbortError');

/**
 * A stand-in for `navigator.locks` with the three behaviours leadership rests
 * on: exactly one holder per name, a FIFO queue that hands the lock on the
 * instant the holder lets go, and — the one a fake usually misses — reclamation
 * when the holder dies without releasing.
 *
 * One instance stands for "the browser", so every simulated tab queues against
 * the others exactly as real ones would.
 *
 * ```ts
 * const locks = new FakeLockManager();
 * const leader = createLeader('cart', { locks, transport: () => hub.connect() });
 * ```
 */
export class FakeLockManager {
  private holds = new Map<string, Hold>();
  private queues = new Map<string, Waiter[]>();
  private nextHoldId = 1;

  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> {
    return this.requestAs(undefined, name, options, callback);
  }

  /**
   * A view of this manager tagged with an owner, so `reclaim(owner)` can take
   * the lock back the way a browser does when the tab holding it disappears.
   */
  forOwner(owner: string): LockManagerLike {
    return {
      request: (name, options, callback) => this.requestAs(owner, name, options, callback),
    };
  }

  /**
   * The tab named `owner` is gone: free every lock it holds and forget every
   * lock it was waiting on.
   *
   * Its callbacks are never settled — that is the point. A crashed tab's code
   * does not get to run again, and a test that asserts the *next* tab took the
   * seat is asserting exactly what the browser guarantees.
   */
  reclaim(owner: string): void {
    for (const [name, hold] of [...this.holds]) {
      if (hold.owner !== owner) continue;
      this.holds.delete(name);
      this.queues.get(name)?.shift()?.grant();
    }
    // Spliced in place rather than replaced: a pending request holds on to its
    // queue, and swapping the array under it would let an abandoned waiter be
    // granted anyway.
    for (const queue of this.queues.values()) {
      for (let at = queue.length - 1; at >= 0; at -= 1) {
        if (queue[at]!.owner === owner) queue.splice(at, 1);
      }
    }
  }

  /** Is this lock held by anyone? */
  isHeld(name: string): boolean {
    return this.holds.has(name);
  }

  /** Which owner holds it, if the request was tagged with one. */
  holder(name: string): string | undefined {
    return this.holds.get(name)?.owner;
  }

  /** How many callers are waiting behind the holder. */
  queued(name: string): number {
    return this.queues.get(name)?.length ?? 0;
  }

  private requestAs(
    owner: string | undefined,
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        const hold: Hold = { owner, id: this.nextHoldId++ };
        this.holds.set(name, hold);
        // The callback holds the lock until its promise settles — the real
        // API's contract, and the mechanism the leader relies on.
        void callback()
          .catch(() => {})
          .then(() => {
            // The lock may have been reclaimed while this ran, in which case it
            // now belongs to someone else and releasing it would hand the same
            // seat to two clients.
            if (this.holds.get(name)?.id !== hold.id) {
              resolve();
              return;
            }
            this.holds.delete(name);
            const next = this.queues.get(name)?.shift();
            resolve();
            next?.grant();
          });
      };

      if (options.signal?.aborted) {
        reject(abortError());
        return;
      }

      if (!this.holds.has(name)) {
        grant();
        return;
      }

      const waiter: Waiter = { owner, grant };
      const queue = this.queues.get(name) ?? [];
      queue.push(waiter);
      this.queues.set(name, queue);

      options.signal?.addEventListener('abort', () => {
        const at = queue.indexOf(waiter);
        // Already granted, or already reclaimed: there is nothing to withdraw,
        // and rejecting a request that has had its turn would be a lie.
        if (at >= 0) {
          queue.splice(at, 1);
          reject(abortError());
        }
      });
    });
  }
}
