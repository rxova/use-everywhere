import { afterEach, describe, expect, it, vi } from 'vitest';
import { devWarn } from '../dev.js';

describe('devWarn', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('warns once per distinct message and dedupes repeats', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    devWarn('dw-test: first');
    devWarn('dw-test: first');
    devWarn('dw-test: second');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, 'dw-test: first');
    expect(warn).toHaveBeenNthCalledWith(2, 'dw-test: second');
  });

  it('is silent in production builds', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { devWarn: prodWarn } = await import('../dev.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    prodWarn('dw-test: never shown');

    expect(warn).not.toHaveBeenCalled();
  });
});
