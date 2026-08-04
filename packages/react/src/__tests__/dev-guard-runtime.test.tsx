import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '@use-everywhere/core';
import { defineChannel } from '../define-channel.js';
import { defineStore } from '../define-store.js';
import { getLeader } from '../registry.js';
import { useSharedState } from '../use-shared-state.js';

/**
 * The production side of every development guard in this package.
 *
 * Vitest runs with `NODE_ENV=test`, so without stubbing, each
 * `process.env.NODE_ENV !== 'production'` guard is permanently true and its
 * other arm is unreachable — which is both a coverage hole and, more to the
 * point, the arm that every real user runs.
 *
 * The counterpart in core (`dev-stripping.test.ts`) proves a bundler can remove
 * these branches entirely; this proves they are inert even when nothing does.
 */
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

const anySchema: StandardSchemaV1<unknown, unknown> = {
  '~standard': { version: 1, vendor: 'handwritten', validate: (value) => ({ value }) },
};

let n = 0;
const uniqueName = () => `dgr-${++n}`;

describe('the development guard at runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is silent when a store is redefined with different options', () => {
    const name = uniqueName();
    defineStore(name, { persist: { read: () => undefined, write: () => {} } }).get();

    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    defineStore(name, {
      persist: { read: () => undefined, write: () => {} },
      persistVersion: 7,
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent when a channel is redefined with different options', () => {
    const name = uniqueName();
    defineChannel(name).get();

    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A *different* set of validated keys, or configureChannel returns early
    // and never reaches the warning this is asserting the silence of.
    defineChannel(name, { schema: { ping: anySchema } }).get();

    expect(warn).not.toHaveBeenCalled();
  });

  it('records nothing extra for a leader created without options', () => {
    const name = uniqueName();

    // The branch where `options` is absent on first creation, which is what
    // every bare useLeader() call takes.
    expect(getLeader(name)).toBe(getLeader(name));
  });

  it('is silent when a later caller asks for different leader timings', () => {
    const name = uniqueName();
    getLeader(name, { heartbeatMs: 20, leaseMs: 60 });

    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    getLeader(name, { heartbeatMs: 999, leaseMs: 999 });

    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent when one key is registered with two different initials', async () => {
    const name = uniqueName();
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function App() {
      // Two callers, two defaults, one key: the first registration wins and the
      // second is discarded. Loud in development, and nothing here.
      useSharedState('k', 1, { store: name });
      useSharedState('k', 2, { store: name });
      return null;
    }
    render(<App />);
    await flush();

    expect(warn).not.toHaveBeenCalled();
  });
});
