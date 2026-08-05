import { useEffect, useState } from 'react';
import { getSharedStore, useClientId, useSharedState, type MessageMeta } from 'use-everywhere';
import { Card, Page } from '../shell/Page.js';
import { Code } from '../shell/Code.js';
import { colorOf } from '../shell/Shell.js';

interface Patch {
  seq: number;
  key: string;
  value: string;
  who: string;
  self: boolean;
}

/** Every patch this tab applies, whoever wrote it. */
function usePatchLog(limit = 12): Patch[] {
  const [log, setLog] = useState<Patch[]>([]);

  useEffect(() => {
    let seq = 0;
    const store = getSharedStore();
    return store.subscribe((key, value, meta: MessageMeta) => {
      setLog((prev) =>
        [
          {
            seq: seq++,
            key,
            value: JSON.stringify(value)?.slice(0, 32) ?? 'undefined',
            who: meta.clientId,
            self: meta.self,
          },
          ...prev,
        ].slice(0, limit),
      );
    });
  }, [limit]);

  return log;
}

export function ConflictsPage() {
  const self = useClientId();
  const [contested, setContested] = useSharedState('contested', 'nobody yet');
  const [versions, setVersions] = useState<Record<string, readonly [number, string]>>({});
  const log = usePatchLog();

  // The clocks live on the store rather than in React state, so they are read
  // on every change rather than mirrored.
  useEffect(() => {
    const store = getSharedStore();
    const read = () => setVersions(store.getVersions());
    read();
    return store.subscribe(read);
  }, []);

  return (
    <Page
      kicker="Version clocks"
      title="Conflicts & clocks"
      lede={
        <>
          Two tabs write the same key at the same moment. Both writes are real, one has to win, and
          every tab has to agree on which — including the tab that lost.
        </>
      }
    >
      <Card title="Two tabs, one key" aside={`you are ${self.slice(0, 6)}`}>
        <div className="row">
          <button type="button" onClick={() => setContested(`${self.slice(0, 6)} was here`)}>
            claim it
          </button>
          <code>{contested}</code>
        </div>
        <p className="hint">
          Open this page in two tabs and press <strong>claim it</strong> in both, as close together
          as you can manage. Both tabs end up showing the same winner. That is not luck: each key
          carries a version <code>[counter, clientId]</code>, a higher counter wins, and an equal
          counter is broken by client id — which every tab computes the same way, without asking
          anyone.
        </p>
      </Card>

      <Card title="store.getVersions()" aside="the clock behind each key">
        {Object.keys(versions).length === 0 ? (
          <p className="empty">no keys yet — write something above</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>key</th>
                <th>counter</th>
                <th>written by</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(versions).map(([key, [counter, who]]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{counter}</td>
                  <td>
                    <span
                      className="peer"
                      style={{ background: colorOf(who), display: 'inline-block' }}
                    />{' '}
                    {who === self ? 'this tab' : who.slice(0, 6)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">
          Per <strong>key</strong>, not per store. Two tabs editing different keys never conflict at
          all, which is the thing whole-store sync gets wrong: there, the loser's unrelated edit
          disappears too.
        </p>
      </Card>

      <Card title="Patch log" aside="what this tab applied, and who sent it">
        {log.length === 0 ? (
          <p className="empty">mutations will appear here</p>
        ) : (
          <ul className="log">
            {log.map((patch) => (
              <li key={patch.seq}>
                <span className="peer" style={{ background: colorOf(patch.who) }} />
                <span>
                  {patch.key} = {patch.value}
                </span>
                <span className="who">{patch.self ? 'you' : patch.who.slice(0, 6)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Code>{`const store = getSharedStore();

// Every applied patch, local or remote.
store.subscribe((key, value, meta) => {
  console.log(key, value, meta.self ? '(this tab)' : meta.clientId);
});

store.getVersions(); // { count: [3, 'a1b2c3'], … }`}</Code>

      <div className="note">
        <strong>Why not just "last message delivered"?</strong> Because delivery order differs per
        tab. Two tabs would each believe a different write arrived last, and they would stay that
        way forever. A clock is what makes "last" a fact rather than a point of view.
      </div>
    </Page>
  );
}
