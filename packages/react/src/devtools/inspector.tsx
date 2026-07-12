import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_NAME, observeBus, type BusEvent, type BusWire } from '@use-everywhere/core';
import { getSharedStore } from '../registry.js';
import { usePeers } from '../use-peers.js';
import type { InspectorProps } from './inspector.types.js';
import { STYLES } from './styles.js';

interface LoggedWire {
  id: number;
  direction: 'in' | 'out';
  label: string;
  from: string;
}

const short = (id: string) => id.slice(0, 6);

function wireLabel(wire: BusWire): string {
  return `${wire.scope}/${wire.type}`;
}

/**
 * A floating panel showing what this tab is saying and hearing on the bus:
 * peers, the leader, store keys with their version clocks, and a live wire log
 * in both directions.
 *
 * It deliberately does **not** create a Leader. Under dynamic eligibility,
 * mounting one with `eligible: false` would disable candidacy for the whole
 * tab, and mounting a plain one would enrol a tab that never asked to be a
 * candidate — a devtool must not change what it measures. Instead it reads the
 * crown out of the wire log, which it already sees in both directions.
 *
 * Presence is fine to use: the bus heartbeats regardless of whether anything
 * created a Presence, so usePeers observes rather than perturbs.
 */
export function Inspector({
  name = DEFAULT_NAME,
  position = 'bottom-right',
  limit = 50,
  defaultOpen = false,
  leaseMs = 3000,
}: InspectorProps = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const [wires, setWires] = useState<readonly LoggedWire[]>([]);
  const [crown, setCrown] = useState<string | null>(null);
  const nextId = useRef(0);
  const crownAt = useRef(0);

  const peers = usePeers({ name });
  const store = getSharedStore(name);

  // Both snapshots are referentially stable and only change when the store
  // notifies, so useSyncExternalStore is the right shape here — same as every
  // other hook in the package.
  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
  const versions = useSyncExternalStore(
    subscribe,
    () => store.getVersions(),
    () => store.getVersions(),
  );

  useEffect(() => {
    return observeBus(name, (event: BusEvent) => {
      const { wire, direction } = event;

      // Infer the crown rather than joining the election.
      if (wire.scope === 'leader') {
        if (wire.type === 'resign') {
          setCrown(null);
          crownAt.current = 0;
        } else if (wire.type === 'claim' || wire.type === 'heartbeat') {
          setCrown(wire.clientId);
          crownAt.current = Date.now();
        }
      }

      setWires((prev) =>
        [
          ...prev.slice(-(limit - 1)),
          {
            id: nextId.current++,
            direction,
            label: wireLabel(wire),
            from: short(wire.clientId),
          },
        ].slice(-limit),
      );
    });
  }, [name, limit]);

  // A leader that stopped talking is no leader. Without this the crown would
  // linger on a tab that crashed.
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (crownAt.current && Date.now() - crownAt.current > leaseMs) {
          setCrown(null);
          crownAt.current = 0;
        }
      },
      // Quarter of the lease, so a vacated crown clears well within it. The
      // floor is low enough that a short lease still works rather than being
      // silently rounded up to something coarser than the lease itself.
      Math.max(50, Math.floor(leaseMs / 4)),
    );
    return () => clearInterval(timer);
  }, [leaseMs]);

  const selfId = store.clientId;
  // Iterate the version map, not the snapshot: every key in the store has a
  // version by construction (registerKey, applyRemote, and setKey all write
  // both), so this drops an unreachable "key without a version" branch.
  const entries = Object.entries(versions);

  return (
    <div className={`ue-ins ue-ins--${position}`} data-testid="ue-inspector">
      <style>{STYLES}</style>

      <button
        type="button"
        className="ue-ins__bar"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="ue-ins__dot" />
        <span className="ue-ins__title">use-everywhere</span>
        <span className="ue-ins__muted">{name}</span>
        {crown ? (
          <span className="ue-ins__crown" data-testid="ue-crown">
            ♔ {crown === selfId ? 'this tab' : short(crown)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="ue-ins__body">
          <div className="ue-ins__section">
            <div className="ue-ins__h">This tab</div>
            <div className="ue-ins__row">
              <span className="ue-ins__k">{short(selfId)}</span>
              <span className="ue-ins__v">
                {crown === selfId ? 'leader' : crown ? 'follower' : 'no leader'}
              </span>
            </div>
          </div>

          <div className="ue-ins__section">
            <div className="ue-ins__h">Peers ({peers.length})</div>
            {peers.length === 0 ? (
              <div className="ue-ins__empty">nobody else here</div>
            ) : (
              peers.map((peer) => (
                <div className="ue-ins__row" key={peer.id}>
                  <span className="ue-ins__k">{short(peer.id)}</span>
                  <span className="ue-ins__v">{peer.kind}</span>
                </div>
              ))
            )}
          </div>

          <div className="ue-ins__section">
            <div className="ue-ins__h">State ({entries.length})</div>
            {entries.length === 0 ? (
              <div className="ue-ins__empty">no keys yet</div>
            ) : (
              entries.map(([key, version]) => (
                <div className="ue-ins__row" key={key}>
                  <span className="ue-ins__k">{key}</span>
                  <span className="ue-ins__v">{JSON.stringify(snapshot[key])}</span>
                  <span className="ue-ins__ver">
                    {version[0]}·{short(version[1])}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="ue-ins__section">
            <div className="ue-ins__h">Wires ({wires.length})</div>
            {wires.length === 0 ? (
              <div className="ue-ins__empty">nothing yet</div>
            ) : (
              <div className="ue-ins__log">
                {wires.map((wire) => (
                  <div className="ue-ins__wire" key={wire.id}>
                    <span className={`ue-ins__dir ue-ins__dir--${wire.direction}`}>
                      {wire.direction === 'out' ? '→' : '←'}
                    </span>
                    <span className="ue-ins__scope">{wire.label}</span>
                    <span className="ue-ins__from">{wire.from}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
