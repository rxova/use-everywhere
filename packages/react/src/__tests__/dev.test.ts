import { afterEach, describe, expect, it, vi } from 'vitest';
import { devWarn, diagnostic, warnOnInitialMismatch } from '../dev.js';

// No React here on purpose: these are the pure diagnostics helpers, and testing
// the production build means re-importing the module, which would give a second
// copy of React to any test that rendered.
describe('devWarn', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('warns once per distinct message and dedupes repeats', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    devWarn('UE9101', 'first');
    devWarn('UE9101', 'first');
    devWarn('UE9102', 'second');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, diagnostic('UE9101', 'first'));
  });

  it('is silent in production builds', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { devWarn: prodWarn } = await import('../dev.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    prodWarn('UE9103', 'never shown');

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('diagnostic', () => {
  it('stamps the code and the page that explains it, exactly as core does', () => {
    expect(diagnostic('UE2001', 'something happened')).toBe(
      '[use-everywhere] UE2001: something happened\n' +
        '  → https://rxova.github.io/use-everywhere/errors/#ue2001',
    );
  });
});

describe('warnOnInitialMismatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('warns when the same key is registered with a different primitive default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnOnInitialMismatch('s', 'k1', 0);
    warnOnInitialMismatch('s', 'k1', 42);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('42');
  });

  it('stays quiet for a matching default, and for null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnOnInitialMismatch('s', 'k2', 'same');
    warnOnInitialMismatch('s', 'k2', 'same');
    warnOnInitialMismatch('s', 'k3', null);
    warnOnInitialMismatch('s', 'k3', null);

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet for object defaults, which are a new reference every render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnOnInitialMismatch('s', 'k4', { a: 1 });
    warnOnInitialMismatch('s', 'k4', { a: 1 });
    // Mixed shapes are not comparable either — one side is an object.
    warnOnInitialMismatch('s', 'k5', { a: 1 });
    warnOnInitialMismatch('s', 'k5', 3);

    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps no bookkeeping in production — dynamic keys would grow it forever', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { warnOnInitialMismatch: prodCheck } = await import('../dev.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    prodCheck('s', 'k', 0);
    prodCheck('s', 'k', 1);

    expect(warn).not.toHaveBeenCalled();
  });
});
