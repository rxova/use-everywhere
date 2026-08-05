import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { observeBus, type BusEvent, type BusWire } from '@use-everywhere/core';
import { getSharedStore } from '../registry.js';
import { usePeers } from '../use-peers.js';
import type { InspectorProps } from './inspector.types.js';

interface LoggedWire {
  id: number;
  direction: 'in' | 'out';
  scope: string;
  label: string;
  from: string;
}

/**
 * A state snapshot as it was when a wire went past, kept so the panel can put
 * it back. The wire id ties a row in the log to the state it produced.
 */
interface Frame {
  wireId: number;
  label: string;
  snapshot: Record<string, unknown>;
}

const short = (id: string) => id.slice(0, 6);

function wireLabel(wire: BusWire): string {
  return `${wire.scope}/${wire.type}`;
}

/** The scopes worth separating. `all` is not a scope; it is the absence of one. */
const SCOPES = ['all', 'state', 'leader', 'presence', 'channel'] as const;
type ScopeView = (typeof SCOPES)[number];

/**
 * The panel's contents. Split out of `Inspector` because the Inspector is now
 * the shadow host and this is what gets portalled into it — keeping them in one
 * component would mean the hooks re-run whenever the host re-renders for
 * reasons that have nothing to do with what is on the wire.
 */
export function Panel({
  name,
  limit,
  leaseMs,
  position,
  defaultOpen,
}: Required<Pick<InspectorProps, 'name' | 'limit' | 'leaseMs' | 'position' | 'defaultOpen'>>) {
  const [open, setOpen] = useState(defaultOpen);
  const [wires, setWires] = useState<readonly LoggedWire[]>([]);
  const [crown, setCrown] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [scopeView, setScopeView] = useState<ScopeView>('all');
  const [editing, setEditing] = useState<{ key: string; draft: string } | null>(null);
  const [frames, setFrames] = useState<readonly Frame[]>([]);
  const nextId = useRef(0);
  const crownAt = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const peers = usePeers({ name });
  const store = getSharedStore(name);

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

      if (wire.scope === 'leader') {
        if (wire.type === 'resign') {
          setCrown(null);
          crownAt.current = 0;
        } else if (wire.type === 'claim' || wire.type === 'heartbeat') {
          setCrown(wire.clientId);
          crownAt.current = Date.now();
        }
      }

      if (pausedRef.current) return;

      const id = nextId.current++;
      const label = wireLabel(wire);
      setWires((prev) =>
        [
          ...prev.slice(-(limit - 1)),
          { id, direction, scope: wire.scope, label, from: short(wire.clientId) },
        ].slice(-limit),
      );

      // Only state wires move state, so only they are worth a frame. Recording
      // presence heartbeats would fill the timeline with identical snapshots.
      //
      // Read the store rather than the rendered `snapshot`: the store has
      // already applied this wire, and React has not re-rendered yet, so the
      // rendered value is the state *before* the wire — which would label every
      // frame with the write that came after it.
      if (wire.scope === 'state') {
        setFrames((prev) =>
          [...prev, { wireId: id, label, snapshot: { ...store.getSnapshot() } }].slice(-limit),
        );
      }
    });
  }, [name, limit, store]);

  useEffect(() => {
    const timer = setInterval(
      () => {
        if (crownAt.current && Date.now() - crownAt.current > leaseMs) {
          setCrown(null);
          crownAt.current = 0;
        }
      },
      Math.max(50, Math.floor(leaseMs / 4)),
    );
    return () => clearInterval(timer);
  }, [leaseMs]);

  const selfId = store.clientId;
  const entries = Object.entries(versions);

  const needle = filter.trim().toLowerCase();
  const shown = wires.filter((wire) => {
    if (scopeView !== 'all' && wire.scope !== scopeView) return false;
    if (!needle) return true;
    return wire.label.toLowerCase().includes(needle) || wire.from.toLowerCase().includes(needle);
  });

  const commit = (key: string, draft: string): void => {
    let value: unknown;
    try {
      value = JSON.parse(draft);
    } catch {
      return;
    }
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

  /**
   * Put a recorded snapshot back.
   *
   * Restoring is a **write**, not a rewind: every key that differs is set
   * through the store, takes a fresh version, and goes on the wire, so peers
   * converge on the restored value instead of quietly disagreeing with the tab
   * that time-travelled. Nothing about history is undone — this is the honest
   * version of the feature, and the label says "restore" rather than "undo" for
   * that reason.
   *
   * Keys added after the frame was taken are left alone rather than deleted:
   * removing a key another tab is using is a bigger claim than a devtool should
   * make from a picture of the past.
   */
  const restore = (frame: Frame): void => {
    for (const [key, value] of Object.entries(frame.snapshot)) {
      if (Object.is(store.getSnapshot()[key], value)) continue;
      store.set(key, value as never);
    }
  };

  return (
    <div className={`ue-ins ue-ins--${position}`} data-testid="ue-inspector">
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
                onClick={() => {
                  setWires([]);
                  setFrames([]);
                }}
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
            <div className="ue-ins__tools" role="group" aria-label="Scope">
              {SCOPES.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  className="ue-ins__btn"
                  aria-pressed={scopeView === scope}
                  onClick={() => setScopeView(scope)}
                  data-testid={`ue-scope-${scope}`}
                >
                  {scope}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div className="ue-ins__empty" data-testid="ue-wires">
                {wires.length === 0 ? 'nothing yet' : 'no matches'}
              </div>
            ) : (
              <div className="ue-ins__log" data-testid="ue-wires">
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

          <div className="ue-ins__section">
            <div className="ue-ins__h">Timeline ({frames.length})</div>
            {frames.length === 0 ? (
              <div className="ue-ins__empty">no state on the wire yet</div>
            ) : (
              <div className="ue-ins__log">
                {frames.map((frame) => (
                  <div className="ue-ins__wire" key={frame.wireId}>
                    <button
                      type="button"
                      className="ue-ins__btn"
                      onClick={() => restore(frame)}
                      data-testid={`ue-restore-${String(frame.wireId)}`}
                    >
                      restore
                    </button>
                    <span className="ue-ins__scope">{frame.label}</span>
                    <span className="ue-ins__from">
                      {Object.keys(frame.snapshot).length} key
                      {Object.keys(frame.snapshot).length === 1 ? '' : 's'}
                    </span>
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
