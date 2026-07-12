import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BroadcastChannelTransport, createLeader } from '@use-everywhere/core';
import { useIsLeader, useLeader, useLeaderEffect } from '../use-leader.js';
import type { UseLeaderOptions } from '../use-leader.types.js';

// Real timers on purpose: fake timers, act(), and BroadcastChannel's async
// delivery interact badly. Short real timings keep the suite fast instead.
const FAST: UseLeaderOptions = { heartbeatMs: 20, leaseMs: 60 };
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

// The registry keys leaders by name and they live for the page, so every test
// needs a name of its own.
let n = 0;
const uniqueName = () => `led-${++n}`;

const otherTab = (name: string) =>
  createLeader(name, {
    ...FAST,
    transport: (busName) => new BroadcastChannelTransport(busName),
  });

function Crown({ name, eligible }: { name: string; eligible?: boolean }) {
  const { leaderId, isLeader } = useLeader({
    name,
    ...FAST,
    ...(eligible === undefined ? {} : { eligible }),
  });
  return <span data-testid="crown">{isLeader ? 'me' : (leaderId ?? 'none')}</span>;
}

describe('useLeader', () => {
  it('elects this tab when it is alone', async () => {
    const name = uniqueName();
    render(<Crown name={name} />);
    expect(screen.getByTestId('crown').textContent).toBe('none');

    await wait(60);

    expect(screen.getByTestId('crown').textContent).toBe('me');
  });

  it('follows an incumbent that is already leading', async () => {
    const name = uniqueName();
    const incumbent = otherTab(name);
    await wait(60);

    render(<Crown name={name} />);
    await wait(40);

    expect(screen.getByTestId('crown').textContent).toBe(incumbent.clientId);

    incumbent.close();
  });

  it('takes the seat when the incumbent resigns', async () => {
    const name = uniqueName();
    const incumbent = otherTab(name);
    await wait(60);

    render(<Crown name={name} />);
    await wait(40);
    expect(screen.getByTestId('crown').textContent).toBe(incumbent.clientId);

    await act(async () => {
      incumbent.close(); // resigns on the way out
      await new Promise<void>((r) => setTimeout(r, 60));
    });

    expect(screen.getByTestId('crown').textContent).toBe('me');
  });

  it('elects on the shared default bus when no name is given', async () => {
    // No `name`: the common case, and the only path through the DEFAULT_NAME
    // fallback. Fast timings so this costs 60ms, not a full 3s lease.
    function DefaultCrown() {
      const { isLeader } = useLeader(FAST);
      return <span data-testid="default">{isLeader ? 'me' : 'none'}</span>;
    }
    render(<DefaultCrown />);

    await wait(60);

    expect(screen.getByTestId('default').textContent).toBe('me');
  });

  it('stands by when told it is not eligible', async () => {
    const name = uniqueName();
    render(<Crown name={name} eligible={false} />);

    await wait(120);

    expect(screen.getByTestId('crown').textContent).toBe('none');
  });
});

describe('useIsLeader', () => {
  it('reports the seat as a boolean', async () => {
    const name = uniqueName();
    function Flag() {
      return <span data-testid="flag">{useIsLeader({ name, ...FAST }) ? 'yes' : 'no'}</span>;
    }
    render(<Flag />);
    expect(screen.getByTestId('flag').textContent).toBe('no');

    await wait(60);

    expect(screen.getByTestId('flag').textContent).toBe('yes');
  });
});

describe('useLeaderEffect', () => {
  it('runs only in the leading tab, and cleans up when the seat is lost', async () => {
    const name = uniqueName();
    const start = vi.fn();
    const stop = vi.fn();

    function Worker() {
      useLeaderEffect(
        () => {
          start();
          return stop;
        },
        { name, ...FAST },
      );
      return null;
    }

    // Somebody else already holds the seat, so our effect must not run.
    const incumbent = otherTab(name);
    await wait(60);

    render(<Worker />);
    await wait(40);
    expect(start).not.toHaveBeenCalled();

    // The seat comes to us.
    await act(async () => {
      incumbent.close();
      await new Promise<void>((r) => setTimeout(r, 60));
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();

    // Now lose it: a claim with a term we cannot beat. This is the path that
    // matters — the socket must close when the seat moves, not just on unmount.
    const usurper = new BroadcastChannelTransport(name);
    await act(async () => {
      usurper.post({
        v: 1,
        scope: 'leader',
        type: 'claim',
        term: [999, 'zzz-usurper'],
        clientId: 'zzz-usurper',
        kind: 'tab',
      });
      await new Promise<void>((r) => setTimeout(r, 30));
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);

    usurper.close();
  });

  it('does not restart when the callback identity changes', async () => {
    const name = uniqueName();
    const start = vi.fn();

    function Worker({ tick }: { tick: number }) {
      // A fresh arrow every render — the effect must not care.
      useLeaderEffect(
        () => {
          start(tick);
        },
        { name, ...FAST },
      );
      return <span data-testid="tick">{tick}</span>;
    }

    const { rerender } = render(<Worker tick={1} />);
    await wait(60);
    expect(start).toHaveBeenCalledTimes(1);

    rerender(<Worker tick={2} />);
    rerender(<Worker tick={3} />);
    await wait(20);

    // Still once: re-running here would reconnect a real socket every render.
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('tears the effect down when the component unmounts', async () => {
    const name = uniqueName();
    const stop = vi.fn();

    function Worker() {
      useLeaderEffect(() => stop, { name, ...FAST });
      return null;
    }

    const { unmount } = render(<Worker />);
    await wait(60);

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
