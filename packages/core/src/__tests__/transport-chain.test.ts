// @vitest-environment happy-dom
// Selection depends on what the platform exposes, so this needs a DOM to take
// things away from.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBus, getTransportKind } from '../bus.js';
import {
  defaultTransport,
  isBroadcastChannelAvailable,
  isStorageEventAvailable,
} from '../transport/default-transport.js';

/**
 * The chain exists because the old behaviour was the worst kind of failure: a
 * browser without BroadcastChannel got a silent no-op, so every write appeared
 * to succeed and nothing was ever shared. Degrading is acceptable; degrading
 * quietly is not.
 */
describe('choosing a transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('prefers BroadcastChannel, silently, because that is the good case', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = defaultTransport('chain-bc');

    expect(transport.kind).toBe('broadcast-channel');
    expect(warn).not.toHaveBeenCalled();
    transport.close();
  });

  it('falls back to the storage event, and says what changes', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = defaultTransport('chain-storage');

    expect(transport.kind).toBe('storage');
    // The fidelity difference is the part a developer needs told: JSON, not
    // structured clone.
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/JSON/);
    transport.close();
  });

  it('degrades to nothing loudly when even storage is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.stubGlobal('localStorage', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = defaultTransport('chain-none');

    expect(transport.kind).toBe('none');
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/nothing is shared/);
    transport.close();
  });

  it('treats storage that exists but throws as unavailable', () => {
    // Safari's old private mode: the object is there, every write throws.
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    // No warning assertion here: devWarn deliberately fires once per distinct
    // message, and the test above already emitted this one. What matters is
    // that a storage object which cannot actually store is not mistaken for a
    // working transport.
    expect(isStorageEventAvailable()).toBe(false);
    const transport = defaultTransport('chain-throwing');

    expect(transport.kind).toBe('none');
    transport.close();
  });

  it('reports availability honestly', () => {
    expect(isBroadcastChannelAvailable()).toBe(true);
    expect(isStorageEventAvailable()).toBe(true);

    vi.stubGlobal('BroadcastChannel', undefined);
    expect(isBroadcastChannelAvailable()).toBe(false);

    vi.stubGlobal('localStorage', null);
    expect(isStorageEventAvailable()).toBe(false);
  });
});

describe('getTransportKind', () => {
  it('answers "is anything even connected?" for a live bus', () => {
    const bus = getBus('tk-live');

    expect(getTransportKind('tk-live')).toBe('broadcast-channel');

    bus.release();
    // Gone with the bus — a name nobody is using has no transport.
    expect(getTransportKind('tk-live')).toBeNull();
  });

  it('is null for a name that has no bus', () => {
    expect(getTransportKind('tk-never-created')).toBeNull();
  });

  it('calls an injected transport custom when it declares no kind', () => {
    // Buses built with a custom transport bypass the registry, so this reads
    // the bus directly rather than by name.
    const bus = getBus('tk-custom', {
      transport: () => ({ post: () => {}, subscribe: () => () => {}, close: () => {} }),
    });

    expect(bus.transportKind).toBe('custom');
    bus.release();
  });
});
