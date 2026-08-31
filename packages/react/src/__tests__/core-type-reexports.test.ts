/**
 * The React package re-exports a curated slice of core, enumerated by hand. That
 * curation had three holes: options reachable from React whose *types* were not.
 *
 * `useLeader({ locks })` is valid because `UseLeaderOptions extends LeaderOptions`,
 * and `SharedWorkerTransportOptions` is re-exported outright — so a React-only app
 * could pass both values and name neither. Anyone writing the factory or a fake
 * lock manager had to reach past their own package into `@use-everywhere/core`.
 *
 * This is a compile-time assertion wearing a runtime test's clothes: the `satisfies`
 * clauses below fail `tsc` if any of the three stops being exported from the entry
 * point. The `expect` is only there to give vitest something to run — a type-only
 * file would be dropped from the suite entirely.
 */
import { describe, expect, it } from 'vitest';

import type {
  LockManagerLike,
  MessagePortLike,
  SharedWorkerLike,
  SharedWorkerTransportOptions,
  UseLeaderOptions,
} from '../index.js';

describe('the core types React callers need', () => {
  it('lets a lock manager be named, not just passed', () => {
    // The shape `useLeader({ locks })` accepts. Minimal on purpose: the point is
    // that the type is nameable here, not that this is a usable fake.
    const locks = {
      request: async (_name, _options, callback) => await callback(),
    } satisfies LockManagerLike;

    const options = { locks } satisfies UseLeaderOptions;

    expect(options.locks).toBe(locks);
  });

  it('lets a SharedWorker factory be typed from this package alone', () => {
    const port = {
      start: () => undefined,
      close: () => undefined,
      postMessage: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } satisfies MessagePortLike;

    const worker = { port } satisfies SharedWorkerLike;
    const options = {
      url: 'https://example.test/relay.js',
      factory: () => worker,
    } satisfies SharedWorkerTransportOptions;

    expect(options.factory?.()).toBe(worker);
  });
});
