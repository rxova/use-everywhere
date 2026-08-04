/** Drain all pending microtasks (and their descendants). */
export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Wait out the late-joiner snapshot window.
 *
 * A peer answers a `hello` after a jittered pause and only if nobody else did,
 * so hydration is no longer a microtask away — it costs up to
 * `snapshotDelayMs` (default 40). One tick is not enough, on purpose: the
 * pause is what turns N replies into one.
 */
export const snapshotWindow = (ms = 80) => new Promise<void>((resolve) => setTimeout(resolve, ms));
