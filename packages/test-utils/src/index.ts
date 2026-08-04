/**
 * Test seams for multi-tab code: everything needed to run several simulated
 * tabs in one process, with no browser and no globals.
 *
 * ```ts
 * import { createScenario } from '@use-everywhere/test-utils';
 * ```
 *
 * `MemoryHub` and `MemoryTransport` are re-exported from
 * `@use-everywhere/core/testing` so a test needs one import rather than two;
 * they are the same classes, not copies.
 */
export { createScenario } from './scenario.js';
export type { Scenario, ScenarioOptions, Tab, TabOptions } from './scenario.types.js';
export { FakeLockManager } from './fake-locks.js';
export { FakeWindow, fakeWindowPair } from './fake-window.js';
export { tick, snapshotWindow } from './timing.js';
export { MemoryHub, MemoryTransport } from '@use-everywhere/core/testing';
