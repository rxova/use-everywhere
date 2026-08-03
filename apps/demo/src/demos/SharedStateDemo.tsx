import { useEffect, useRef, useState } from 'react';
import { getSharedStore, useSharedState, type MessageMeta } from 'use-everywhere';
import { colorOf } from '../origins.js';

interface Patch {
  seq: number;
  key: string;
  value: string;
  who: string;
  kind: string;
  self: boolean;
}

function usePatchLog(limit = 6): Patch[] {
  const [log, setLog] = useState<Patch[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const store = getSharedStore();
    return store.subscribe((key, value, meta: MessageMeta) => {
      const patch: Patch = {
        seq: seq.current++,
        key,
        value: JSON.stringify(value)?.slice(0, 40) ?? 'undefined',
        who: meta.clientId,
        kind: meta.kind,
        self: meta.self,
      };
      setLog((prev) => [patch, ...prev].slice(0, limit));
    });
  }, [limit]);
  return log;
}

export function SharedStateDemo() {
  const [count, setCount] = useSharedState('count', 0);
  const [note, setNote] = useSharedState('note', '');
  const [workerTicks] = useSharedState('workerTicks', 0);
  const [workerOn, setWorkerOn] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const log = usePatchLog();

  const toggleWorker = () => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current = null;
      setWorkerOn(false);
    } else {
      workerRef.current = new Worker(new URL('../tick-worker.ts', import.meta.url), {
        type: 'module',
      });
      setWorkerOn(true);
    }
  };

  // The impolite exit. `terminate()` stops the worker mid-instruction: no
  // `bye`, no chance to run anything. The dot cannot disappear on a message
  // that is never sent, so it goes when presence stops getting an answer.
  const killWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setWorkerOn(false);
  };
  useEffect(() => () => workerRef.current?.postMessage('stop'), []);

  return (
    <>
      <div className="card">
        <h2>useSharedState('count')</h2>
        <div className="row">
          <button onClick={() => setCount((c) => c - 1)} aria-label="decrement">
            −
          </button>
          <div className="count">{count}</div>
          <button onClick={() => setCount((c) => c + 1)} aria-label="increment">
            +
          </button>
        </div>
      </div>

      <div className="card">
        <h2>useSharedState('note')</h2>
        <input
          type="text"
          value={note}
          placeholder="Type here — watch it appear in the other tab"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="card">
        <h2>useSharedState('workerTicks') — written by a Web Worker</h2>
        <div className="row">
          <button data-testid="toggle-worker" onClick={toggleWorker}>
            {workerOn ? 'Stop worker' : 'Start worker'}
          </button>
          {workerOn && (
            <button data-testid="kill-worker" onClick={killWorker}>
              Kill worker
            </button>
          )}
          <div className="count" data-testid="worker-ticks" style={{ fontSize: 24 }}>
            {workerTicks}
          </div>
        </div>
        <p className="hint">
          The worker runs the same core library and does <code>state.workerTicks++</code> once a
          second. Square dots in the strip above are workers.
        </p>
        <p className="hint">
          <strong>Stop</strong> asks it to shut down, so it says goodbye and its dot goes at once.{' '}
          <strong>Kill</strong> is <code>terminate()</code> — no goodbye, so the dot lingers for a
          few seconds until presence gives up on it. Both are correct; only one is instant.
        </p>
      </div>

      <div className="card">
        <h2>Patch log</h2>
        {log.length === 0 ? (
          <p className="hint log-empty">mutations will appear here</p>
        ) : (
          <ul className="log">
            {log.map((p) => (
              <li key={p.seq}>
                <span
                  className={`dot${p.kind === 'worker' ? ' worker' : ''}`}
                  style={{ background: colorOf(p.who), width: 9, height: 9 }}
                />
                <span className="k">{p.key}</span> = {p.value}
                <span>· {p.self ? 'you' : `${p.kind} ${p.who}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
