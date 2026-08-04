// @vitest-environment happy-dom
// Needs real DOM globals: the transport fallback probes addEventListener and
// localStorage, and stubbing those one at a time on the node environment only
// discovers the next missing one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '../bus.js';
import { newClientId } from '../ids.js';
import { createSharedStore } from '../shared-store.js';
import { MemoryHub } from '../transport/memory-hub.js';
import { recordSkew } from '../wire.js';
import { busTable, resetRendezvous } from '../rendezvous.js';
import { createGate } from '../schema.js';
import type { StandardSchemaV1 } from '../schema.types.js';
import { defaultTransport } from '../transport/default-transport.js';

/**
 * The other half of the stripping guarantee.
 *
 * `dev-stripping.test.ts` proves a bundler *can* remove the guarded warnings.
 * This proves the guard also does its job when nothing bundled the package at
 * all — a plain Node consumer, or a build that never defines `NODE_ENV` — where
 * the branch is taken at runtime rather than folded away.
 *
 * It is also the only way to execute the production side of these branches:
 * Vitest runs with `NODE_ENV=test`, so without stubbing, every guard in the
 * library is permanently true and its false arm is unreachable.
 */
const silentInProduction = (name: string, trigger: () => void) => {
  it(`is silent in production: ${name}`, () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    trigger();

    expect(warn).not.toHaveBeenCalled();
  });
};

const rejecting: StandardSchemaV1<unknown, number> = {
  '~standard': {
    version: 1,
    vendor: 'handwritten',
    validate: () => ({ issues: [{ message: 'no' }] }),
  },
};

describe('the development guard at runtime', () => {
  beforeEach(() => resetRendezvous());
  afterEach(() => {
    resetRendezvous();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  silentInProduction('a clientId minted without crypto.randomUUID', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      newClientId();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });

  silentInProduction('two rendezvous protocols on one page', () => {
    const g = globalThis as typeof globalThis & Record<symbol, unknown>;
    // Pre-seed the census with a foreign protocol so the next attach reports a
    // mismatch — the same state two bundled copies of different versions leave.
    g[Symbol.for('use-everywhere.rendezvous.census')] = { protocols: [99] };
    busTable();
  });

  silentInProduction('a transport with nothing left to fall back to', () => {
    const original = globalThis.BroadcastChannel;
    const originalStorage = globalThis.localStorage;
    // @ts-expect-error deleting a global to reproduce a browser that lacks it
    delete globalThis.BroadcastChannel;
    // Storage that exists but throws on write: Safari's old private mode, and
    // the reason the probe writes rather than merely checking for the object.
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      },
      configurable: true,
    });
    try {
      defaultTransport('guard-none').close();
    } finally {
      globalThis.BroadcastChannel = original;
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalStorage,
        configurable: true,
      });
    }
  });

  silentInProduction('a transport falling back to the storage event', () => {
    const originalChannel = globalThis.BroadcastChannel;
    // @ts-expect-error deleting a global to reproduce a browser that lacks it
    delete globalThis.BroadcastChannel;
    try {
      defaultTransport('guard-storage').close();
    } finally {
      globalThis.BroadcastChannel = originalChannel;
    }
  });

  silentInProduction('a second store on one name', () => {
    const first = createSharedStore('guard-dup', { a: 0 });
    const second = createSharedStore('guard-dup', { a: 0 });
    first.close();
    second.close();
  });

  silentInProduction('a restore refused for being from a newer build', () => {
    const store = createSharedStore(
      'guard-restore',
      { a: 0 },
      {
        transport: () => new MemoryHub().connect(),
        persist: {
          adapter: {
            read: () => ({ v: 1, schema: 9, state: { a: 1 }, versions: { a: [1, 'x'] } }) as never,
            write: () => {},
          },
          version: 1,
        },
      },
    );
    store.close();
  });

  silentInProduction('a later caller asking for different bus options', () => {
    const first = getBus('guard-bus', { heartbeatMs: 100, kind: 'tab' });
    const second = getBus('guard-bus', { heartbeatMs: 999, kind: 'worker' });
    first.release();
    second.release();
  });

  silentInProduction('a peer speaking another wire protocol', () => {
    recordSkew('guard-skew', 2);
  });

  silentInProduction('a payload rejected by its schema', () => {
    const gate = createGate('guard-schema', { k: rejecting }, undefined);
    gate?.accepts('k', 1);
  });
});
