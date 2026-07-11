/** Drain all pending microtasks (and their descendants). */
export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
