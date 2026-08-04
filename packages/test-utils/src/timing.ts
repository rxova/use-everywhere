/**
 * Drain pending microtasks — and the microtasks they queue.
 *
 * Delivery on a `BroadcastChannel`, and on the MemoryHub that stands in for it,
 * is asynchronous. `await tick()` is the line between "this tab wrote" and
 * "every other tab has seen it".
 */
export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Wait out the late-joiner snapshot window.
 *
 * A peer answers a newcomer's `hello` after a jittered pause, and only if
 * nobody else already did — which is what turns N replies into one. Hydration
 * is therefore not a microtask away: it costs up to `snapshotDelayMs`, 40 by
 * default. One `tick()` is not enough, on purpose.
 */
export const snapshotWindow = (ms = 80): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
