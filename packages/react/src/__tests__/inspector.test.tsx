import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  BroadcastChannelTransport,
  createLeader,
  observeBus,
  type BusEvent,
} from '@use-everywhere/core';
import { Inspector } from '../devtools/index.js';
import { getSharedStore } from '../registry.js';

const flush = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

let n = 0;
const uniqueName = () => `ins-${++n}`;

describe('<Inspector />', () => {
  it('never enrols the tab in an election it did not ask to join', async () => {
    const name = uniqueName();
    const seen: BusEvent[] = [];
    const stop = observeBus(name, (event) => seen.push(event));

    render(<Inspector name={name} defaultOpen />);
    await flush(80);

    // This is the whole design constraint: a devtool must not change what it
    // measures. Creating a Leader here would make a passive tab a candidate.
    const claims = seen.filter((e) => e.wire.scope === 'leader');
    expect(claims).toHaveLength(0);

    stop();
  });

  it('reads the crown out of the wire log', async () => {
    const name = uniqueName();
    render(<Inspector name={name} defaultOpen />);

    // A real leader elsewhere on the bus. The Inspector never talks to it —
    // it just sees the heartbeats go past.
    const leader = createLeader(name, {
      heartbeatMs: 20,
      leaseMs: 60,
      transport: (busName) => new BroadcastChannelTransport(busName),
    });
    await flush(60);

    expect(screen.getByTestId('ue-crown').textContent).toContain(leader.clientId.slice(0, 6));

    leader.close();
  });

  it('says "this tab" when the seat is ours', async () => {
    const name = uniqueName();
    render(<Inspector name={name} defaultOpen />);

    // No custom transport, so this Leader takes the shared registry bus — the
    // same bus, and the same clientId, as the store the Inspector reads. The
    // Inspector then sees its *own outbound* claim, which is precisely the half
    // of the traffic the debug seam exists to expose.
    const mine = createLeader(name, { heartbeatMs: 20, leaseMs: 60 });
    await flush(60);

    expect(screen.getByTestId('ue-crown').textContent).toContain('this tab');
    expect(screen.getByTestId('ue-inspector').textContent).toContain('leader');

    mine.close();
  });

  it('drops the crown when the leader stops talking', async () => {
    const name = uniqueName();
    render(<Inspector name={name} leaseMs={60} defaultOpen />);

    const ghost = new BroadcastChannelTransport(name);
    await act(async () => {
      ghost.post({
        v: 1,
        scope: 'leader',
        type: 'heartbeat',
        term: [1, 'ghost'],
        clientId: 'ghost',
        kind: 'tab',
      });
      await new Promise<void>((r) => setTimeout(r, 10));
    });
    expect(screen.queryByTestId('ue-crown')).not.toBeNull();

    // Silence past the lease: a leader that stopped talking is no leader.
    await flush(140);

    expect(screen.queryByTestId('ue-crown')).toBeNull();
    ghost.close();
  });

  it('clears the crown when the leader resigns', async () => {
    const name = uniqueName();
    render(<Inspector name={name} defaultOpen />);

    const peer = new BroadcastChannelTransport(name);
    await act(async () => {
      peer.post({
        v: 1,
        scope: 'leader',
        type: 'claim',
        term: [1, 'p'],
        clientId: 'p',
        kind: 'tab',
      });
      await new Promise<void>((r) => setTimeout(r, 10));
    });
    expect(screen.queryByTestId('ue-crown')).not.toBeNull();

    await act(async () => {
      peer.post({
        v: 1,
        scope: 'leader',
        type: 'resign',
        term: [1, 'p'],
        clientId: 'p',
        kind: 'tab',
      });
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(screen.queryByTestId('ue-crown')).toBeNull();
    peer.close();
  });

  it('shows store keys with their version clocks', async () => {
    const name = uniqueName();
    render(<Inspector name={name} defaultOpen />);

    act(() => getSharedStore(name).set('theme', 'dark'));
    await flush();

    const panel = screen.getByTestId('ue-inspector');
    expect(panel.textContent).toContain('theme');
    expect(panel.textContent).toContain('"dark"');
    expect(panel.textContent).toContain('1·'); // counter 1
  });

  it('logs wires in both directions', async () => {
    const name = uniqueName();
    render(<Inspector name={name} defaultOpen />);

    // Outbound: our own store speaking. This is the half a transport-only
    // observer could never see.
    act(() => getSharedStore(name).set('k', 1));
    await flush();
    expect(screen.getByTestId('ue-inspector').textContent).toContain('→');

    // Inbound: a peer speaking.
    const peer = new BroadcastChannelTransport(name);
    await act(async () => {
      peer.post({
        v: 1,
        scope: 'presence',
        type: 'ping',
        clientId: 'peer-1',
        kind: 'tab',
      });
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(screen.getByTestId('ue-inspector').textContent).toContain('←');
    peer.close();
  });

  it('caps the log at the limit', async () => {
    const name = uniqueName();
    render(<Inspector name={name} limit={3} defaultOpen />);

    const store = getSharedStore(name);
    act(() => {
      for (let i = 0; i < 10; i++) store.set('k', i);
    });
    await flush();

    expect(screen.getByTestId('ue-inspector').textContent).toContain('Wires (3)');
  });

  it('starts collapsed and toggles open', async () => {
    const name = uniqueName();
    render(<Inspector name={name} />);
    await flush();

    expect(screen.getByTestId('ue-inspector').textContent).not.toContain('Peers');

    act(() => screen.getByRole('button').click());

    expect(screen.getByTestId('ue-inspector').textContent).toContain('Peers');
  });

  it('server-renders without touching the bus', () => {
    // getServerSnapshot has to hand back something stable, or React throws
    // "The result of getServerSnapshot should be cached".
    const html = renderToString(<Inspector name={uniqueName()} defaultOpen />);

    expect(html).toContain('use-everywhere');
    expect(html).toContain('no keys yet');
  });

  it('renders empty states and honours position and the default name', async () => {
    render(<Inspector position="top-left" defaultOpen />);
    await flush();

    const panel = screen.getByTestId('ue-inspector');
    expect(panel.className).toContain('ue-ins--top-left');
    expect(panel.textContent).toContain('nobody else here');
  });

  describe('the wire log', () => {
    it('freezes while paused and picks up again on resume', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('k', 1));
      await flush();
      expect(screen.getByTestId('ue-inspector').textContent).toContain('Wires (1)');

      act(() => screen.getByTestId('ue-pause').click());
      act(() => store.set('k', 2));
      await flush();

      // Paused is paused: the traffic happened, the log did not move.
      expect(screen.getByTestId('ue-inspector').textContent).toContain('Wires (1)');
      expect(screen.getByTestId('ue-inspector').textContent).toContain('paused');

      act(() => screen.getByTestId('ue-pause').click());
      act(() => store.set('k', 3));
      await flush();

      expect(screen.getByTestId('ue-inspector').textContent).toContain('Wires (2)');
    });

    it('empties on clear, and keeps recording afterwards', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('k', 1));
      await flush();
      act(() => screen.getByTestId('ue-clear').click());

      expect(screen.getByTestId('ue-inspector').textContent).toContain('nothing yet');

      act(() => store.set('k', 2));
      await flush();
      expect(screen.getByTestId('ue-inspector').textContent).toContain('Wires (1)');
    });

    it('filters by scope and by sender, and says when nothing matches', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('k', 1));
      await flush();

      const filter = screen.getByTestId('ue-filter');
      act(() => {
        fireEvent.change(filter, { target: { value: 'state' } });
      });
      expect(screen.getByTestId('ue-inspector').textContent).toContain('Wires (1)');

      act(() => {
        fireEvent.change(filter, { target: { value: 'nothing-like-this' } });
      });
      const panel = screen.getByTestId('ue-inspector');
      expect(panel.textContent).toContain('no matches');
      // The count still says how much is being hidden rather than pretending
      // the log is empty.
      expect(panel.textContent).toContain('of 1');
    });
  });

  describe('editing a value', () => {
    it('writes through the store, so every tab gets it', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('theme', 'dark'));
      await flush();

      act(() => screen.getByTestId('ue-value-theme').click());
      const input = screen.getByTestId('ue-edit-theme');
      act(() => {
        fireEvent.change(input, { target: { value: '"light"' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      await flush();

      expect(store.getSnapshot().theme).toBe('light');
      // Through the store means a version was taken; a local poke would not
      // have moved the clock, and no peer would ever have heard about it.
      expect(store.getVersions().theme?.[0]).toBe(2);
    });

    it('refuses a draft that is not JSON, and says so', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('theme', 'dark'));
      await flush();

      act(() => screen.getByTestId('ue-value-theme').click());
      const input = screen.getByTestId('ue-edit-theme');
      act(() => {
        // Unquoted: what someone types when they mean the string. Guessing
        // between that and an identifier is how a panel starts disagreeing
        // with the wire, so it is simply refused.
        fireEvent.change(input, { target: { value: 'light' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      expect(store.getSnapshot().theme).toBe('dark');
      expect(screen.getByTestId('ue-edit-theme').className).toContain('invalid');
    });

    it('starts from an empty draft for a value JSON has no word for', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      // `undefined` clones fine and JSON does not represent it, so the draft
      // starts empty rather than saying "undefined" — which would round-trip
      // as a parse error.
      act(() => store.set('missing', undefined));
      await flush();

      act(() => screen.getByTestId('ue-value-missing').click());

      expect((screen.getByTestId('ue-edit-missing') as HTMLInputElement).value).toBe('');
    });

    it('abandons the edit on Escape', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('theme', 'dark'));
      await flush();

      act(() => screen.getByTestId('ue-value-theme').click());
      const input = screen.getByTestId('ue-edit-theme');
      act(() => {
        fireEvent.change(input, { target: { value: '"light"' } });
        fireEvent.keyDown(input, { key: 'Escape' });
      });

      expect(store.getSnapshot().theme).toBe('dark');
      expect(screen.queryByTestId('ue-edit-theme')).toBeNull();
    });

    it('closes the editor when it loses focus', async () => {
      const name = uniqueName();
      render(<Inspector name={name} defaultOpen />);
      const store = getSharedStore(name);

      act(() => store.set('theme', 'dark'));
      await flush();

      act(() => screen.getByTestId('ue-value-theme').click());
      act(() => {
        fireEvent.blur(screen.getByTestId('ue-edit-theme'));
      });

      expect(screen.queryByTestId('ue-edit-theme')).toBeNull();
      expect(store.getSnapshot().theme).toBe('dark');
    });
  });
});
