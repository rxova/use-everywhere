import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLeader } from '../registry.js';
import { useSharedState } from '../use-shared-state.js';

// Every silent conflict in this API is a bug someone else has to find at
// runtime. These are the warnings that make them findable.
describe('dev diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns when one key is registered with two different initial values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = `mismatch-${Math.random().toString(36).slice(2)}`;

    function A() {
      const [v] = useSharedState('count', 0, { store });
      return <span>{v}</span>;
    }
    function B() {
      // First registration wins, so this 99 is silently discarded.
      const [v] = useSharedState('count', 99, { store });
      return <span>{v}</span>;
    }

    render(
      <>
        <A />
        <B />
      </>,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("useSharedState('count')");
    expect(message).toContain('99');
  });

  it('stays quiet when the initial values agree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = `agree-${Math.random().toString(36).slice(2)}`;

    function A() {
      const [v] = useSharedState('count', 7, { store });
      return <span>{v}</span>;
    }

    render(
      <>
        <A />
        <A />
      </>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not cry wolf over object initials, which are new references each render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = `objects-${Math.random().toString(36).slice(2)}`;

    function A() {
      const [v] = useSharedState('profile', { name: 'ada' }, { store });
      return <span>{v.name}</span>;
    }

    render(
      <>
        <A />
        <A />
      </>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when a later caller asks the leader for different timings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const name = `leader-opts-${Math.random().toString(36).slice(2)}`;

    const first = getLeader(name, { heartbeatMs: 1000, leaseMs: 3000 });
    getLeader(name, { heartbeatMs: 1000, leaseMs: 3000 }); // agrees: silent
    expect(warn).not.toHaveBeenCalled();

    getLeader(name, { leaseMs: 50 }); // conflicts: ignored, so say so

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('leaseMs');

    first.close();
  });
});
