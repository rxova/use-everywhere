import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_NAME, observeBus, type BusEvent, type BusWire } from '@use-everywhere/core';
import { getSharedStore } from '../registry.js';
import { usePeers } from '../use-peers.js';
import type { InspectorProps } from './inspector.types.js';
import { STYLES } from './styles.js';

interface LoggedWire {
  id: number;
  direction: 'in' | 'out';
  scope: string;
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
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<{ key: string; draft: string } | null>(null);
  const nextId = useRef(0);
  const crownAt = useRef(0);
  // Read inside the observer, so pausing does not re-subscribe: tearing the
  // observer down and back up would drop the traffic in between, and a log you
  // paused is not a log with a hole in it.
  const pausedRef = useRef(false);

  // Written in the effect phase, like every other ref in this package: React
  // forbids mutating one during render, and the observer only reads it later.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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

      // Paused freezes the *log*, never the crown above: leadership is state,
      // not history, and showing a stale one would be a lie rather than a pause.
      if (pausedRef.current) return;

      setWires((prev) =>
        [
          ...prev.slice(-(limit - 1)),
          {
            id: nextId.current++,
            direction,
            scope: wire.scope,
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

  // Matched against `scope/type` and the sender, which is what someone types
  // when they mean "just the leader traffic" or "just that tab".
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? wires.filter(
        (wire) =>
          wire.label.toLowerCase().includes(needle) || wire.from.toLowerCase().includes(needle),
      )
    : wires;

  /**
   * Write an edited value back to the store.
   *
   * Parsed as JSON, so `"dark"` is a string and `dark` is a mistake — which is
   * the honest reading. The alternative, guessing between them, would make the
   * panel disagree with the wire about what a value is.
   */
  const commit = (key: string, draft: string): void => {
    let value: unknown;
    try {
      value = JSON.parse(draft);
    } catch {
      return;
    }
    // Through the store, not around it: the write takes a version, goes on the
    // wire, and reaches every peer. A devtool that edited local state only
    // would show a value no other tab has.
    store.set(key, value as never);
    setEditing(null);
  };

  const draftIsValid = (draft: string): boolean => {
    try {
      JSON.parse(draft);
      return true;
    } catch {
      return false;
    }
  };

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
                  {editing?.key === key ? (
                    <input
                      className={`ue-ins__edit${draftIsValid(editing.draft) ? '' : ' ue-ins__v--invalid'}`}
                      value={editing.draft}
                      autoFocus
                      aria-label={`Value of ${key}`}
                      onChange={(event) => setEditing({ key, draft: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commit(key, editing.draft);
                        if (event.key === 'Escape') setEditing(null);
                      }}
                      onBlur={() => setEditing(null)}
                      data-testid={`ue-edit-${key}`}
                    />
                  ) : (
                    <button
                      type="button"
                      className="ue-ins__v ue-ins__v--editable"
                      onClick={() =>
                        setEditing({ key, draft: JSON.stringify(snapshot[key]) ?? '' })
                      }
                      data-testid={`ue-value-${key}`}
                    >
                      {JSON.stringify(snapshot[key])}
                    </button>
                  )}
                  <span className="ue-ins__ver">
                    {version[0]}·{short(version[1])}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="ue-ins__section">
            <div className="ue-ins__h">
              Wires ({shown.length}
              {shown.length === wires.length ? '' : ` of ${wires.length}`})
              {paused ? <span className="ue-ins__paused"> · paused</span> : null}
            </div>
            <div className="ue-ins__tools">
              <button
                type="button"
                className="ue-ins__btn"
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
                data-testid="ue-pause"
              >
                {paused ? 'resume' : 'pause'}
              </button>
              <button
                type="button"
                className="ue-ins__btn"
                onClick={() => setWires([])}
                data-testid="ue-clear"
              >
                clear
              </button>
              <input
                className="ue-ins__filter"
                value={filter}
                placeholder="filter"
                aria-label="Filter wires"
                onChange={(event) => setFilter(event.target.value)}
                data-testid="ue-filter"
              />
            </div>
            {shown.length === 0 ? (
              <div className="ue-ins__empty">
                {wires.length === 0 ? 'nothing yet' : 'no matches'}
              </div>
            ) : (
              <div className="ue-ins__log">
                {shown.map((wire) => (
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
