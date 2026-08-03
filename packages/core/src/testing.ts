/**
 * Test seams, on their own entry point.
 *
 * These used to sit on the package root, which made them part of the public,
 * semver-bound API — and put a multi-client simulation harness in every
 * production bundle's module graph. jsdom has no BroadcastChannel, so testing
 * multi-tab behaviour genuinely needs them; they are simply not part of the
 * runtime surface.
 *
 * ```ts
 * import { MemoryHub } from '@use-everywhere/core/testing';
 *
 * const hub = new MemoryHub();
 * const a = createSharedStore('cart', {}, { transport: () => hub.connect() });
 * const b = createSharedStore('cart', {}, { transport: () => hub.connect() });
 * // a and b are now two simulated tabs on one bus.
 * ```
 */
export { MemoryHub } from './transport/memory-hub.js';
export { MemoryTransport } from './transport/memory-transport.js';
