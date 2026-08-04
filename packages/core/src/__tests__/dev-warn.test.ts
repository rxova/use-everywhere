import { afterEach, describe, expect, it, vi } from 'vitest';
import { devWarn, diagnostic } from '../dev.js';

describe('diagnostic', () => {
  it('stamps the code and the page that explains it', () => {
    expect(diagnostic('UE9999', 'something happened')).toBe(
      '[use-everywhere] UE9999: something happened\n' +
        '  → https://rxova.org/packages/use-everywhere/errors/#ue9999',
    );
  });
});

describe('devWarn', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('warns once per distinct message and dedupes repeats', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    devWarn('UE9001', 'first');
    devWarn('UE9001', 'first');
    devWarn('UE9002', 'second');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, diagnostic('UE9001', 'first'));
    expect(warn).toHaveBeenNthCalledWith(2, diagnostic('UE9002', 'second'));
  });

  it('is silent in production builds', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { devWarn: prodWarn } = await import('../dev.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    prodWarn('UE9003', 'never shown');

    expect(warn).not.toHaveBeenCalled();
  });
});
