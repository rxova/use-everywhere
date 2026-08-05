import { useEffect, useState } from 'react';
import {
  getSharedStore,
  useClientId,
  usePeers,
  useSharedState,
  type MessageMeta,
} from 'use-everywhere';
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

  // Sorted the way the tie-break sorts: `a[1] > b[1]`, plain string comparison,
  // highest first. Every tab computes this same list from data it already has.
  const peers = usePeers({ includeSelf: true });
  const ranked = peers
    .map((peer) => peer.id)
    .sort()
    .reverse();

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
          as you can manage. Both tabs end up showing the same winner — and the tab that lost sees
          its own text replaced, which is the part that feels wrong and is exactly the point.
        </p>
        <p className="hint">
          Here is the whole rule. Every write carries a version <code>[counter, clientId]</code>,
          and the counter is <em>one more than the counter that tab had seen</em>. Two tabs that
          both saw counter 3 therefore both write counter 4 — a tie. The tie is settled by comparing
          the two client ids as plain strings, and the higher string wins:
        </p>
        <pre style={{ margin: '10px 0 0', fontSize: 12.5, color: '#8b9bb0' }}>
          {'newer(a, b) = a.counter > b.counter\n' +
            '           || (a.counter === b.counter && a.clientId > b.clientId)'}
        </pre>
        <p className="hint">
          No election, no timestamps, no asking anyone. Both tabs already hold both ids, both run
          the same comparison, and so both reach the same answer —{' '}
          <strong>in whichever order the two messages happen to arrive</strong>. That last part is
          what makes it convergence rather than a race: the loser's write is discarded on arrival{' '}
          <em>and</em> undone at home, so the two tabs cannot end up disagreeing.
        </p>
      </Card>

      <Card title="Who wins a tie, on this bus, right now" aside="highest id first">
        <div className="row">
          {ranked.map((id, index) => (
            <span key={id} className={`tag${id === self ? ' tag--on' : ''}`}>
              {index === 0 ? '♛ ' : ''}
              {id === self ? `${id.slice(0, 8)} — you` : id.slice(0, 8)}
            </span>
          ))}
        </div>
        <p className="hint">
          {ranked[0] === self
            ? 'Your id sorts highest, so this tab wins every tie on this bus. Open another tab and the list may reorder — ids are random per tab, not per browser.'
            : 'Your id does not sort highest, so a simultaneous write from the tab above yours wins. Nothing is unfair about it: the rule only has to be the same everywhere, not favourable to anyone.'}
        </p>
        <p className="hint">
          Ties are also rarer than they sound. Two writes only tie when both tabs wrote from the
          same starting counter — genuinely simultaneous. A write that arrives after seeing the
          other one carries a higher counter and wins on the first comparison, no tie-break needed.
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
