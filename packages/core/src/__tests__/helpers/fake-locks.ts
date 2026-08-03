import type { LockManagerLike } from '../../leader.types.js';

/**
 * A stand-in for `navigator.locks` with the two behaviours the leader depends
 * on: exactly one holder per name, and a FIFO queue that hands the lock to the
 * next waiter the instant the holder lets go.
 *
 * One shared instance stands for "the browser", so several simulated tabs
 * queue against each other exactly as real ones would.
 */
export class FakeLockManager implements LockManagerLike {
  private holder = new Map<string, boolean>();
  private queues = new Map<string, Array<() => void>>();

  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        this.holder.set(name, true);
        // The callback holds the lock until its promise settles — the real
        // API's contract, and the mechanism the leader relies on.
        void callback()
          .catch(() => {})
          .then(() => {
            this.holder.set(name, false);
            const next = this.queues.get(name)?.shift();
            resolve();
            next?.();
          });
      };

      if (options.signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }

      if (!this.holder.get(name)) {
        grant();
        return;
      }

      const queue = this.queues.get(name) ?? [];
      queue.push(grant);
      this.queues.set(name, queue);
      options.signal?.addEventListener('abort', () => {
        const pending = this.queues.get(name);
        const at = pending?.indexOf(grant) ?? -1;
        if (pending && at >= 0) {
          pending.splice(at, 1);
          reject(new DOMException('aborted', 'AbortError'));
        }
      });
    });
  }

  /** Who, if anyone, currently holds this lock — for assertions. */
  isHeld(name: string): boolean {
    return this.holder.get(name) === true;
  }

  /** How many callers are waiting behind the holder. */
  queued(name: string): number {
    return this.queues.get(name)?.length ?? 0;
  }
}
